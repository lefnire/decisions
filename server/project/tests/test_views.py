# project/tests/test_auth.py


import time
import json
import re
import unittest

from project.server import db
from project.server import models as m
from project.tests.base import BaseTestCase


class BaseViewTestCase(BaseTestCase):
    def setUp(self):
        super(BaseViewTestCase, self).setUp()

        # Create a comparison to which testing user has no access
        user = m.User(email='other@x.com', password='123456')
        db.session.add(user)
        db.session.commit()
        self.other_user = user
        self.inaccessible_comparison = user.create_comparison(
            title='Comparison1 (inaccessible)',
            features=[
                m.Feature(title='Feature1 (inaccessible)'),
                m.Feature(title='Feature2 (inaccessible)')
            ],
            candidates=[
                m.Candidate(title='Candidate1 (inaccessible)'),
                m.Candidate(title='Candidate2 (inaccessible)')
            ]
        ).comparison

    def do_test_anonymous(self):
        data, resp = self.client_get(self.endpoint)
        self.assert401(resp)
        data, resp = self.client_get(self.endpoint + self.inaccessible_id)
        self.assert401(resp)
        data, resp = self.client_delete(self.endpoint + self.inaccessible_id)
        self.assert401(resp)
        data, resp = self.client_put(self.endpoint + self.inaccessible_id)
        self.assert401(resp)

    def do_test_valid_perms(self):
        token = self.auth_user()

        if self.endpoint == '/comparisons/': # FIXME move these to their own tests
            data, resp = self.client_get(self.endpoint, token=token)
            self.assert200(resp)
            assert data['data'] == []
            body = dict(title='Title')
            data, resp = self.client_post(self.endpoint, data=body, token=token)
            self.assert200(resp)
        else:
            data, resp = self.client_get(self.endpoint, token=token)
            self.assert404(resp)
            body = dict(title='Title')
            data, resp = self.client_post(self.endpoint, data=body, token=token)
            self.assert404(resp)

    def do_test_invalid_perms(self):
        token = self.auth_user()

        data, resp = self.client_get(self.endpoint + self.inaccessible_id, token=token)
        self.assert404(resp)
        data, resp = self.client_put(self.endpoint + self.inaccessible_id, token=token)
        self.assert404(resp)
        data, resp = self.client_delete(self.endpoint + self.inaccessible_id, token=token)
        self.assert404(resp)

    def do_test_get_all(self):
        # Starts empty
        token = self.auth_user()
        endpoint = self.endpoint
        if endpoint != '/comparisons/':
            # For features/candidates, we need a comparison to work from
            comp, _ = self.client_post('/comparisons/', data=dict(title='Title'), token=token)
            #FIXME!!!!
            endpoint = re.sub(r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}", endpoint, comp['data']['id'])
        data, resp = self.client_get(endpoint, token=token)
        assert data['data'] == []

        # Then populates
        body = dict(
            title='Title',
            description='Description'
        )
        data, resp = self.client_post(self.endpoint, data=body, token=token)
        comp = data['data']
        assert comp['title'] == 'Title'
        assert comp['description'] == 'Description'

        # Now comparisons should have created item
        data, resp = self.client_get(self.endpoint, token=token)
        comp = data['data'][0]
        assert len(data['data']) == 1
        assert comp['title'] == 'Title'


    def do_test_delete(self): pass
    def do_test_put(self): pass


class TestComparisons(BaseViewTestCase):
    def setUp(self):
        super(TestComparisons, self).setUp()
        self.endpoint = '/comparisons/'
        self.inaccessible_id = self.inaccessible_comparison.id

    def test_anonymous(self): self.do_test_anonymous()
    def test_valid_perms(self): self.do_test_valid_perms()
    def test_invalid_perms(self): self.do_test_invalid_perms()
    def test_get_all(self): self.do_test_get_all()

    def test_get(self):
        token = self.auth_user()
        body = dict(
            title='ComparisonTitle',
            description='ComparisonDescription'
        )
        data, resp = self.client_post('/comparisons/', data=body, token=token)
        comp = data['data']
        for i in range(3):
            num = str(i+1)
            endpoint = '/comparisons/' + comp['id']
            data, resp = self.client_post(
                endpoint + '/features/',
                data=dict(title='Feature-' + num),
                token=token
            )
            assert data['data']['title'] == 'Feature-' + num

            data, resp = self.client_post(
                endpoint + '/candidates/',
                data=dict(title='Candidate-' + num),
                token=token
            )
            assert data['data']['title'] == 'Candidate-' + num

            data, resp = self.client_get(
                endpoint,
                token=token
            )
            assert len(data['data']['features']) == i+1
            assert len(data['data']['candidates']) == i+1

class TestFeatures(BaseViewTestCase):
    def setUp(self):
        super(TestFeatures, self).setUp()
        self.endpoint = '/comparisons/' + self.inaccessible_comparison.id + '/features/'
        self.inaccessible_id = self.inaccessible_comparison.features[0].id

    def test_anonymous(self): self.do_test_anonymous()
    def test_valid_perms(self): self.do_test_valid_perms()
    def test_invalid_perms(self): self.do_test_invalid_perms()
    def test_get_all(self): self.do_test_get_all()


class TestCandidates(BaseViewTestCase):
    def setUp(self):
        super(TestCandidates, self).setUp()
        self.endpoint = '/comparisons/' + self.inaccessible_comparison.id + '/candidates/'
        self.inaccessible_id = self.inaccessible_comparison.candidates[0].id

    def test_anonymous(self): self.do_test_anonymous()
    def test_valid_perms(self): self.do_test_valid_perms()
    def test_invalid_perms(self): self.do_test_invalid_perms()
    def test_get_all(self): self.do_test_get_all()


if __name__ == '__main__':
    unittest.main()
