# project/server/models.py


import jwt
import datetime
import enum
import uuid
import pdb
import tempfile
import pandas as pd
import numpy as np
import tensorflow as tf
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
                'exp': datetime.datetime.utcnow() + datetime.timedelta(days=0, seconds=5),
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

    def _assert_candidate_permission(self, candidate_id):
        # Find the UserComparison, compare permission
        candidate = db.session.query(Candidate).filter_by(id=candidate_id).first()
        user_comparison = db.session.query(UserComparison) \
            .filter_by(user_id=self.id, comparison_id=candidate.comparison_id).first()
        assert user_comparison and user_comparison.permission.value >= PermissionEnum.score.value, \
            "You don't have permission to score this candidate"

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
        self._assert_candidate_permission(candidate_id)
        hunch = Hunch(user_id=self.id, candidate_id=candidate_id, score=score)
        db.session.add(hunch)
        db.session.commit()

        # TODO kick this off in the background
        hunch.candidate.comparison.train()

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
    comparison = relationship('Comparison')

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
    features = relationship('Feature', backref='comparison')
    candidates = relationship('Candidate', backref='comparison')

    def destroy(self):
        """
        FIXME this method should be unecessary. Instead we should be able to use `db.session.delete(comparison)`,
        however that approach attempts to nullify the features/candidates FKs instead of respecting ondelete='CASCADE',
        am I doing something wrong?
        """
        db.engine.execute(text('DELETE FROM comparisons WHERE id=:id'), id=self.id)

    def scoreboard(self):
        """
        Gets a sorted list of candidates w/i a comparison, ordered by score average across voters
        """
        query = """
            SELECT c.*,
              ARRAY_AGG('{"feature_id":' || s.feature_id || ', "score_id":' || s.score || '}') as features,
              SUM(s.score) as score
            FROM candidates c
            LEFT JOIN (
              SELECT _s.feature_id, 
                _s.candidate_id, 
                AVG(_s.score) * (SELECT weight FROM features WHERE _s.feature_id=features.id) score
              FROM scores _s
              GROUP BY _s.feature_id, _s.candidate_id
            ) s ON s.candidate_id=c.id
            WHERE c.comparison_id=:comparison_id
            GROUP BY c.id
            ORDER BY score DESC
        """
        return db.engine.execute(text(query), comparison_id=self.id).fetchall()

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

    def train(self):
        """Train our linear regression classifier (TODO make this a stochastic bg job)"""
        query = """
            SELECT hunches.id, hunches.score, -- hunch_id discarded, needed for unique grouping  
              -- Collect features, ensure same feature-order for ML matrix
              ARRAY_AGG(scores.score ORDER BY scores.feature_id) features
            FROM candidates
            INNER JOIN hunches ON hunches.candidate_id=candidates.id
            INNER JOIN scores ON scores.candidate_id=candidates.id
            WHERE comparison_id=%(comparison_id)s
            GROUP BY hunches.id, hunches.score
        """
        df = pd.read_sql(query, db.engine, params={'comparison_id': self.id})
        # Can't pull features straight from sql_df, it's squashed as [list(1,2,3), list(3,4,5)]; ie one-item rows
        labels, features = df['score'], self.series_to_df(df['features'])

        # https://github.com/tensorflow/tensorflow/blob/r1.2/tensorflow/examples/learn/wide_n_deep_tutorial.py
        # TODO how to get feature.name in here? Ie tf.contrib.layers.real_valued_column("education_num")
        # TODO if hunches exceed some #, use ANN instead of LinReg
        feature_columns = [tf.contrib.layers.real_valued_column(str(k)) for k in features.keys()]
        m = tf.contrib.learn.LinearRegressor(
            # model_dir=tempfile.mkdtemp(),
            feature_columns=feature_columns
        )
        m.fit(input_fn=lambda: self.input_fn(features, labels), steps=200)
        # m.save('model-' + self.id + '.tfl')
        return m

    def evaluate(self):
        """TODO"""
        pass

    def predict(self):
        # Make candidate prediction from our linear regression model"""
        m = tf.contrib.learn.LinearRegressor()
        # m.load('model-' + self.id + '.tfl')

        query = """
            SELECT candidates.id,  
              ARRAY_AGG(scores.score ORDER BY scores.feature_id) features
            FROM candidates
            INNER JOIN scores ON scores.candidate_id=candidates.id
            WHERE comparison_id=%(comparison_id)s
            GROUP BY candidates.id
        """
        df = pd.read_sql(query, db.engine, params={'comparison_id': self.id})
        ids, features = df['id'], self.series_to_df(df['features'])

        predictions = m.predict(input_fn=lambda: self.input_fn(features))
        df = pd.DataFrame(predictions)
        df['ids'] = ids
        results = []
        for row in df.values:
            candidate = db.session.query(Candidate).filter_by(id=str(row[1])).first()
            candidate.score = row[0]
            results.append(candidate)
        results.sort(key=lambda x: x.score, reverse=True)
        return results

    def hunchboard(self):
        """
        Gets a sorted list of candidates w/i a comparison, ordered by score average across voters.
        Hunches learn features.weight, not scores.score
        """
        return self.predict(model)


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

    id = db.Column(pg.UUID, primary_key=True, default=uuid_default)
    user_id = db.Column(pg.UUID, db.ForeignKey('users.id', **fk_cascade), primary_key=True)
    candidate_id = db.Column(pg.UUID, db.ForeignKey('candidates.id', **fk_cascade), primary_key=True)
    candidate = relationship('Candidate')

    score = db.Column(db.Integer, nullable=False)  # TODO min: 0, max: 5
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)
