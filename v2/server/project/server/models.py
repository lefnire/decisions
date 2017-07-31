# project/server/models.py


import jwt
import datetime
import enum
import uuid
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

    def score(self, candidate_id, feature_id, score):
        # Find the UserComparison, compare permission
        candidate = db.session.query(Candidate).filter_by(id=candidate_id).first()
        user_comparison = db.session.query(UserComparison)\
            .filter_by(user_id=self.id, comparison_id=candidate.comparison_id).first()
        assert user_comparison and user_comparison.permission.value >= PermissionEnum.score.value, \
            "You don't have permission to score this candidate"

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
    features = relationship('Feature')
    candidates = relationship('Candidate')

    def destroy(self):
        """
        FIXME this method should be unecessary. Instead we should be able to use `db.session.delete(comparison)`,
        however that approach attempts to nullify the features/candidates FKs instead of respecting ondelete='CASCADE',
        am I doing something wrong?
        """
        db.engine.execute(text('DELETE FROM comparisons WHERE id=:id'), id=self.id)

    def get_scoreboard(self):
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
    score = db.Column(db.Integer, nullable=False)  # min: 0, max: 5

    # TODO add id column or timestamp or such that we can have multiple scores for a user-candidate-feature
    # (when voting once per day)