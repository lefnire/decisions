# project/server/models.py

import pdb
from pprint import pprint

import jwt
import datetime
import enum
import uuid
import json
import tempfile
import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn import preprocessing
from tensorflow.contrib.learn import LinearRegressor, DNNRegressor
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy.orm import relationship
from sqlalchemy import text

from project.server import app, db, bcrypt


def uuid_default():
    return str(uuid.uuid4())


orm_cascade = {'cascade': "all, delete-orphan"}
fk_cascade = {'onupdate': 'CASCADE', 'ondelete': 'CASCADE'}


class PermissionEnum(enum.Enum):
    """
    Enum of user's permissions on a comparison, in order of inclusive descending permission
    (ie "add_feature" implies add_feature + add_candidate + score + view)
    """
    owner = 5
    add_feature = 4
    add_candidate = 3
    score = 2
    view = 1


class User(db.Model):
    """ User Model for storing user related details """
    __tablename__ = "users"

    id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    registered_on = db.Column(db.DateTime, nullable=False)
    comparisons = relationship('UserComparison')

    def __init__(self, email, password):
        self.email = email
        self.password = bcrypt.generate_password_hash(
            password, app.config.get('BCRYPT_LOG_ROUNDS')
        ).decode()
        self.registered_on = datetime.datetime.now()

    def encode_auth_token(self, user_id):
        """
        Generates the Auth Token
        :return: string
        """
        try:
            payload = {
                # 'exp': datetime.datetime.utcnow() + datetime.timedelta(days=0, seconds=5),
                'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7, seconds=0),
                'iat': datetime.datetime.utcnow(),
                'sub': user_id
            }
            return jwt.encode(
                payload,
                app.config.get('SECRET_KEY'),
                algorithm='HS256'
            )
        except Exception as e:
            return e

    @staticmethod
    def decode_auth_token(auth_token):
        """
        Validates the auth token
        :param auth_token:
        :return: integer|string
        """
        try:
            payload = jwt.decode(auth_token, app.config.get('SECRET_KEY'))
            is_blacklisted_token = BlacklistToken.check_blacklist(auth_token)
            if is_blacklisted_token:
                return 'Token blacklisted. Please log in again.'
            else:
                return payload['sub']
        except jwt.ExpiredSignatureError:
            return 'Signature expired. Please log in again.'
        except jwt.InvalidTokenError:
            return 'Invalid token. Please log in again.'

    def create_comparison(self, **kwargs):
        self.comparisons.append(UserComparison(
            permission=PermissionEnum.owner,
            comparison=Comparison(**kwargs)
        ))
        db.session.commit()
        return self.comparisons[-1]

    def share_comparison(self, comparison_id, friend_id, permission=PermissionEnum.add_feature):
        assert permission != PermissionEnum.owner, 'There can only be one owner.'
        assert comparison_id in map(lambda c: c.comparison.id, self.comparisons), \
            "Only the owner of a comparison can share it."
        user_comparison = UserComparison(
            user_id=friend_id,
            comparison_id=comparison_id,
            permission=permission
        )
        db.session.add(user_comparison)
        db.session.commit()
        return user_comparison

    def get_comparison(self, comparison_id):
        join = db.session.query(UserComparison) \
            .filter_by(user_id=self.id, comparison_id=comparison_id).first()
        return join and join.comparison

    def _assert_candidate_permission(self, candidate_id):
        # Find the UserComparison, compare permission
        candidate = db.session.query(Candidate).filter_by(id=candidate_id).first()
        user_comparison = db.session.query(UserComparison) \
            .filter_by(user_id=self.id, comparison_id=candidate.comparison_id).first()
        assert user_comparison and user_comparison.permission.value >= PermissionEnum.score.value, \
            "You don't have permission to score this candidate"
        return candidate

    def score(self, candidate_id, feature_id, score):
        self._assert_candidate_permission(candidate_id)

        # Is there an existing score to update? (Fix this later)
        score_rec = db.session.query(Score)\
            .filter_by(user_id=self.id, candidate_id=candidate_id, feature_id=feature_id).first()
        if score_rec:
            score_rec.score = score
        else:
            score_rec = Score(user_id=self.id, candidate_id=candidate_id, feature_id=feature_id, score=score)
            db.session.add(score_rec)
        db.session.commit()
        return score_rec

    def hunch(self, candidate_id, score):
        """Either add a new hunch, or update the last hunch (if their most recent hunch
        is less than 1h ago)
        """

        # If they've already hunched recently, just update that
        one_hour_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        recent_hunch = db.session.query(Hunch)\
            .filter_by(user_id=self.id, candidate_id=candidate_id)\
            .filter(Hunch.timestamp > one_hour_ago).first()
        if recent_hunch:
            recent_hunch.score = score
            db.session.commit()
            return recent_hunch

        # Else add a new hunch
        candidate = self._assert_candidate_permission(candidate_id)
        hunch = Hunch(user_id=self.id, comparison_id=candidate.comparison_id, candidate_id=candidate_id, score=score)
        db.session.add(hunch)
        db.session.commit()
        candidate.comparison.update_hunches()
        return hunch

    def destroy(self):
        """
        Call this instead of deleting users directly; it removes orphaned comparisons where self is owner, etc
        :return: None
        """
        query = """
            DELETE FROM comparisons WHERE id IN 
              (SELECT comparison_id FROM users_comparisons WHERE user_id=:uid AND permission=:perm);
            DELETE FROM users WHERE id=:uid; 
        """
        db.engine.execute(text(query), uid=self.id, perm=PermissionEnum.owner.name)


class BlacklistToken(db.Model):
    """
    Token Model for storing JWT tokens
    """
    __tablename__ = 'blacklist_tokens'

    id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    token = db.Column(db.String(500), unique=True, nullable=False)
    blacklisted_on = db.Column(db.DateTime, nullable=False)

    def __init__(self, token):
        self.token = token
        self.blacklisted_on = datetime.datetime.now()

    def __repr__(self):
        return '<id: token: {}'.format(self.token)

    @staticmethod
    def check_blacklist(auth_token):
        # check whether auth token has been blacklisted
        res = BlacklistToken.query.filter_by(token=str(auth_token)).first()
        if res:
            return True
        else:
            return False


class UserComparison(db.Model):
    """
    Join table of users & comparisons, with any meta (eg permissions)
    """
    __tablename__ = 'users_comparisons'

    user_id = db.Column(pg.UUID, db.ForeignKey('users.id', **fk_cascade), primary_key=True)
    comparison_id = db.Column(pg.UUID, db.ForeignKey('comparisons.id', **fk_cascade), primary_key=True)
    comparison = relationship('Comparison', backref='user_comparison')

    permission = db.Column(db.Enum(PermissionEnum), default=PermissionEnum.owner)
    weight = db.Column(db.Float)  # how much this user's vote counts (keep?)


class Comparison(db.Model):
    """
    Comparison "document" between multiple candidates
    """
    __tablename__ = 'comparisons'

    id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    features = relationship('Feature')
    candidates = relationship('Candidate', backref='comparison')
    hunches = relationship('Hunch', backref='comparison')

    def destroy(self):
        """
        FIXME this method should be unecessary. Instead we should be able to use `db.session.delete(comparison)`,
        however that approach attempts to nullify the features/candidates FKs instead of respecting ondelete='CASCADE',
        am I doing something wrong?
        """
        db.engine.execute(text('DELETE FROM comparisons WHERE id=:id'), id=self.id)

    def get_candidates(self, user_id=None):
        """
        Gets a sorted list of candidates w/i a comparison, ordered by score average across voters
        """
        query = """
SELECT c.id, c.title, c.description, c.links, c.hunch,
  s.features, 
  COALESCE(s.score_total, 0) score_total, 
  COALESCE(s.score_norm, 0) score_norm,
  COALESCE(h.hunch_norm::FLOAT, 0) hunch_norm, 
  COALESCE(h.hunch_total, 0) hunch_total,
  (SELECT h.score
    FROM hunches h
    WHERE h.candidate_id=c.id
      AND h.user_id=:user_id
      AND h.timestamp > now() - interval '1 hour'
    LIMIT 1
  ) last_hunch
FROM candidates c

LEFT JOIN (
  SELECT s.candidate_id,
    ARRAY_AGG(
        '{"feature_id":"'||s.feature_id||'", "score_weighted":'||s.score_weighted||', "score":'||s.score||'}'
    ) features,
    SUM(s.score_weighted) score_total,
    0 as score_norm

  FROM (
    SELECT s.feature_id, s.candidate_id, s.score,
      AVG(s.score) * (SELECT weight FROM features f WHERE s.feature_id=f.id) score_weighted
    FROM scores s
    GROUP BY s.feature_id, s.candidate_id, s.score
  ) s

  GROUP BY s.candidate_id
) s ON s.candidate_id=c.id

-- candidate.hunch already exists, should I just add these two columns to candidate instead of calc'ing here?
LEFT JOIN (
  SELECT h.candidate_id,
    AVG(h.score) hunch_norm,
    SUM(h.score) hunch_total
  FROM hunches h
  GROUP BY h.candidate_id
) h ON h.candidate_id=c.id

WHERE c.comparison_id=:comparison_id

GROUP BY c.id, s.features, s.score_total, s.score_norm, h.hunch_total, h.hunch_norm;
        """
        rows = db.engine.execute(text(query), comparison_id=self.id, user_id=user_id).fetchall()
        if len(rows) == 0: return []
        rows = [dict(r) for r in rows]

        # Normalize candidate.score_weighted to candidate.score_norm across all candidates
        scaler = preprocessing.MinMaxScaler()
        scaled = scaler.fit_transform([r['score_total'] for r in rows])
        for i, r in enumerate(rows):
            score_norm = scaled[i] * 5
            # Calculate combined first so we don't propagate rounding error
            r['combined_total'] = round((r['score_total'] + r['hunch_total']) / 2, 1)
            r['combined_norm'] = round((score_norm + r['hunch_norm']) / 2, 1)

            # Then round the rest
            r['score_norm'] = round(score_norm, 1)
            r['score_total'] = round(r['score_total'], 1)
            r['hunch_total'] = round(r['hunch_total'], 1)
            r['hunch_norm'] = round(r['hunch_norm'], 1)

            r['features'] = [json.loads(f) for f in r['features']] if r['features'] else []

        return rows

    @staticmethod
    def input_fn(features, labels=None):
        """Input builder function. See https://www.tensorflow.org/tutorials/wide"""
        feature_cols = {str(k): tf.constant(features[k].values) for k in features.keys()}
        if labels is None:
            return feature_cols
        label = tf.constant(labels.values)
        return feature_cols, label

    @staticmethod
    def series_to_df(series):
        return pd.DataFrame([row for row in series])

    def _train(self, deep=False):
        """Train our linear regression classifier (TODO make this a stochastic bg job)"""
        print("Training....")
        query = """
            SELECT h.timestamp, h.score, -- timestamp discarded, needed for unique grouping  
              -- Collect features, ensure same feature-order for ML matrix
              ARRAY_AGG(s.score ORDER BY s.feature_id) features
            FROM candidates c
            INNER JOIN hunches h ON h.candidate_id=c.id
            INNER JOIN scores s ON s.candidate_id=c.id
            WHERE c.comparison_id=%(comparison_id)s
            GROUP BY h.timestamp, h.score
        """
        df = pd.read_sql(query, db.engine, params={'comparison_id': self.id})
        # Can't pull features straight from sql_df, it's squashed as [list(1,2,3), list(3,4,5)]; ie one-item rows
        labels, features = df['score'], self.series_to_df(df['features'])

        # https://github.com/tensorflow/tensorflow/blob/r1.2/tensorflow/examples/learn/wide_n_deep_tutorial.py
        # TODO how to get feature.name in here? Ie tf.contrib.layers.real_valued_column("education_num")
        feature_columns = [tf.contrib.layers.real_valued_column(str(k)) for k in features.keys()]
        if deep:
            m = DNNRegressor(
                hidden_units=[len(feature_columns)/2],  # TODO experiment
                feature_columns=feature_columns
            )
        else:
            m = LinearRegressor(
                feature_columns=feature_columns
            )
        m.fit(input_fn=lambda: self.input_fn(features, labels), steps=200)
        return m

    def _evaluate(self):
        """TODO"""
        pass

    def _predict(self, m):
        # Make candidate prediction from our linear regression model"""
        print("Predicting...")
        query = """
            SELECT c.id,  
              ARRAY_AGG(s.score ORDER BY s.feature_id) features
            FROM candidates c
            INNER JOIN scores s ON s.candidate_id=c.id
            WHERE c.comparison_id=%(comparison_id)s
            GROUP BY c.id
        """
        df = pd.read_sql(query, db.engine, params={'comparison_id': self.id})
        ids, features = df['id'], self.series_to_df(df['features'])

        predictions = m.predict(input_fn=lambda: self.input_fn(features))
        df = pd.DataFrame([p for p in predictions])
        df['ids'] = ids
        results = []
        for row in df.values:
            candidate = db.session.query(Candidate).filter_by(id=str(row[1])).first()
            candidate.score = row[0]
            results.append(candidate)
        results.sort(key=lambda x: x.score, reverse=True)
        return results

    def update_hunches(self):
        """
        Gets a sorted list of candidates w/i a comparison, ordered by score average across voters.
        Hunches learn features.weight, not scores.score
        """

        # TODO here we'll do the ML
        hunches = self.hunches
        if True or len(hunches) < 20:
            # 1. set each candidate.hunch to its average from hunches
            query = """
                UPDATE candidates SET hunch=(
                  SELECT AVG(score) 
                  FROM hunches 
                  WHERE hunches.candidate_id=candidates.id
                  GROUP BY candidates.id 
                ) 
                WHERE candidates.comparison_id=:comparison_id
            """
            db.engine.execute(text(query), comparison_id=self.id)
        elif 100 > len(hunches) > 20:
            # 2. calculate SVM, SGD, and grid-search average. Set candidate[].hunch
            # if len(hunches) % 3 != 0: return  # every 3rd hunch (save compute)
            model = self._train()
            self._predict(model)
        else:
            # 3. Else if len(hunches)>100, every 3rd do DNN, set candidate[].hunch
            # if len(hunches) % 3 != 0: return  # every 3rd hunch (save compute)
            model = self._train(deep=True)
            self._predict(model)

        # TODO here just grab the candidate.hunch[] out of database, since it's calculated in user.hunch()


    def to_json(self):
        return dict(
            id=self.id,
            title=self.title,
            description=self.description,
            features=[f.to_json() for f in self.features],
            candidates=[c.to_json() for c in self.candidates]
        )


class Feature(db.Model):
    """
    Feature for comparison (ie, a column in the training data matrix)
    """
    __tablename__ = 'features'

    id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    weight = db.Column(db.Float, nullable=False, default=5)  # min=0, max=5
    # lower_is_better=False
    comparison_id = db.Column(pg.UUID, db.ForeignKey('comparisons.id', **fk_cascade), nullable=False)

    def to_json(self):
        return dict(id=self.id, title=self.title, description=self.description, weight=self.weight)


class Candidate(db.Model):
    """
    A candidate for comparison
    """
    __tablename__ = 'candidates'

    id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    links = db.Column(pg.ARRAY(db.String))
    comparison_id = db.Column(pg.UUID, db.ForeignKey('comparisons.id', **fk_cascade), nullable=False)
    # Running hunch for this candidate. Starts as AVG (first 50) then LinReg (50-100) then DNN (100+)
    hunch = db.Column(db.Float)

    def to_json(self):
        return dict(id=self.id, title=self.title, description=self.description, links=self.links)


class Score(db.Model):
    """
    A user's score on a candidate.feature
    """
    __tablename__ = 'scores'

    user_id = db.Column(pg.UUID, db.ForeignKey('users.id', **fk_cascade), primary_key=True)
    candidate_id = db.Column(pg.UUID, db.ForeignKey('candidates.id', **fk_cascade), primary_key=True)
    feature_id = db.Column(pg.UUID, db.ForeignKey('features.id', **fk_cascade), primary_key=True)
    score = db.Column(db.Integer, nullable=False)  # TODO min: 0, max: 5


class Hunch(db.Model):
    """
    A hunch is a user's score-of-the-moment. Can be done many times per day; unlike a score, which is singleton.
    Hunches are used in a machine-learning algo to _learn_ the feature weights of the user
    """
    __tablename__ = 'hunches'

    # id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    user_id = db.Column(pg.UUID, db.ForeignKey('users.id', **fk_cascade), primary_key=True)
    candidate_id = db.Column(pg.UUID, db.ForeignKey('candidates.id', **fk_cascade), primary_key=True)
    comparison_id = db.Column(pg.UUID, db.ForeignKey('comparisons.id', **fk_cascade), primary_key=True)

    score = db.Column(db.Integer, nullable=False)  # TODO min: 0, max: 5
    timestamp = db.Column(db.DateTime, nullable=False, primary_key=True, default=datetime.datetime.utcnow)
