# project/tests/test_user_model.py



import unittest
import pdb
from pprint import pprint

from project.server import db
from project.tests.base import BaseTestCase
from project.server import models as m


class TestModels(BaseTestCase):

    def setUp(self):
        super(TestModels, self).setUp()
        user = m.User(
            email='owner@test.com',
            password='test'
        )
        friend = m.User(
            email='friend@test.com',
            password='test'
        )
        db.session.add(user)
        db.session.add(friend)
        user.create_comparison(
            title='New Computer',
            candidates=[
                m.Candidate(title='Mac'),
                m.Candidate(title='Windows'),
                m.Candidate(title='Linux'),
            ],
            features=[
                m.Feature(title='Simplicity'),
                m.Feature(title='Price'),
                m.Feature(title='Gaming'),
                m.Feature(title='Development Environment')
            ]
        )
        # Refresh user just to make sure relations stuck
        self.user = db.session.query(m.User).filter_by(id=user.id).first()
        self.friend = friend

    def _comparison_and_association(self):
        return self.user.comparisons[0].comparison, self.user.comparisons[0]

    def _score_some(self):
        comparison, _ = self._comparison_and_association()
        for candidate in comparison.candidates:
            for feature in comparison.features:
                # For a simple test, just make an object 1, 2, 3 -rank scoreboard (test complex situations elsewhere)
                score = {
                    'Mac': 5,
                    'Windows': 4,
                    'Linux': 3
                }[candidate.title]
                self.user.score(candidate_id=candidate.id, feature_id=feature.id, score=score)

    def test_create_records(self):
        comparison, association = self._comparison_and_association()
        self.assertTrue(association.permission == m.PermissionEnum.owner)
        self.assertTrue(comparison.title == 'New Computer')
        self.assertTrue(comparison.features[0].title == 'Simplicity')
        self.assertTrue(comparison.candidates[0].title == 'Mac')

    def test_score(self):
        comparison, _ = self._comparison_and_association()
        candidate_id, feature_id = comparison.candidates[0].id, comparison.features[0].id
        score = self.user.score(candidate_id, feature_id, 10)
        assert score.score == 10, 'Test created a score'

        score = self.user.score(candidate_id, feature_id, 5)
        assert score.score == 5
        assert db.session.query(m.Score)\
            .filter_by(candidate_id=candidate_id, feature_id=feature_id, user_id=self.user.id).one(), \
            'Test updated already-created score'

    def test_scoreboard_sanity_check(self):
        comparison, _ = self._comparison_and_association()
        self._score_some()
        scoreboard = comparison.scoreboard()
        assert scoreboard[0].title == 'Mac'
        assert scoreboard[1].title == 'Windows'
        assert scoreboard[2].title == 'Linux'

    def test_delete_user(self):
        self.user.destroy()
        assert db.session.query(m.User.id).count() == 1, "Only the friend remains"
        assert db.session.query(m.Comparison.id).count() == 0
        assert db.session.query(m.Feature.id).count() == 0
        assert db.session.query(m.Candidate.id).count() == 0
        assert db.session.query(m.UserComparison).count() == 0
        assert db.session.query(m.Score).count() == 0

    def test_delete_comparison(self):
        comparison, _ = self._comparison_and_association()
        comparison.destroy()
        assert db.session.query(m.User.id).count() == 2, "User shouldn't be deleted"
        assert db.session.query(m.Comparison.id).count() == 0
        assert db.session.query(m.Candidate.id).count() == 0
        assert db.session.query(m.Feature.id).count() == 0
        assert db.session.query(m.UserComparison).count() == 0
        assert db.session.query(m.Score).count() == 0

    def test_share_comparison(self):
        comparison, _ = self._comparison_and_association()
        self.user.share_comparison(comparison.id, self.friend.id)
        assert db.session.query(m.UserComparison).filter_by(user_id=self.friend.id).first()

    def test_multi_score(self):
        comparison, _ = self._comparison_and_association()
        self.user.share_comparison(comparison.id, self.friend.id)
        for candidate in comparison.candidates:
            for feature in comparison.features:
                score = {
                    'Mac': 5,
                    'Windows': 4,
                    'Linux': 3
                }[candidate.title]
                self.user.score(candidate_id=candidate.id, feature_id=feature.id, score=score)
                self.friend.score(candidate_id=candidate.id, feature_id=feature.id, score=score-1)
        scoreboard = comparison.scoreboard()
        assert scoreboard[0].title == 'Mac'
        error_msg = "It should average between multiple users' scores"
        # 20 = 4 features * 5 score (default). 4.5 = AVG(user's score (5), friend's score (4))
        assert scoreboard[0].score == 4.5*20, error_msg
        assert scoreboard[1].title == 'Windows'
        assert scoreboard[1].score == 3.5*20, error_msg
        assert scoreboard[2].title == 'Linux'
        assert scoreboard[2].score == 2.5*20, error_msg

    def test_hunchboard(self):
        return
        comparison, _ = self._comparison_and_association()
        self._score_some()
        for i, candidate in enumerate(comparison.candidates):
            self.user.hunch(candidate_id=candidate.id, score=5-i)
        assert db.session.query(m.Hunch).count() == 3
        results = comparison.hunchboard()
        assert results[0].title == 'Mac'
        assert results[1].title == 'Windows'
        assert results[2].title == 'Linux'
        print('Scores: {} {} {}'.format(results[0].score, results[1].score, results[2].score))

    def test_participant_hunches_are_weighted(self): pass
    def test_participant_scores_are_weighted(self): pass
    def test_update_attrs(self): pass

    # Later
    def test_some_bad_permission_situations(self): pass
    def test_not_all_features_scored(self): pass


if __name__ == '__main__':
    unittest.main()
