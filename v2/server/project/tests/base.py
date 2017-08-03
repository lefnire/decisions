# project/tests/base.py

import json
from flask_testing import TestCase

from project.server import app, db


class BaseTestCase(TestCase):
    """ Base Tests """

    def create_app(self):
        app.config.from_object('project.server.config.TestingConfig')
        return app

    def setUp(self):
        db.create_all()
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()

    def _build_req_kwargs(self, **kwargs):
        obj = dict(content_type='application/json')
        if kwargs.get('token', None):
            obj['headers'] = dict(
                Authorization='Bearer ' + kwargs['token']
            )
        if kwargs.get('data', None):
            obj['data'] = json.dumps(kwargs['data'])
        return obj

    def client_get(self, url, token=None):
        kwargs = self._build_req_kwargs(token=token)
        resp = self.client.get(url, **kwargs)
        return json.loads(resp.data.decode()), resp

    def client_post(self, url, data=None, token=None):
        kwargs = self._build_req_kwargs(data=data, token=token)
        resp = self.client.post(url, **kwargs)
        return json.loads(resp.data.decode()), resp

    def client_put(self, url, data=None, token=None):
        kwargs = self._build_req_kwargs(data=data, token=token)
        resp = self.client.put(url, **kwargs)
        return json.loads(resp.data.decode()), resp

    def client_delete(self, url, token=None):
        kwargs = self._build_req_kwargs(token=token)
        resp = self.client.delete(url, **kwargs)
        return json.loads(resp.data.decode()), resp

    def register_user(self, email, password):
        return self.client_post(
            '/auth/register',
            data=dict(email=email, password=password)
        )

    def login_user(self, email, password):
        return self.client_post(
            '/auth/login',
            data=dict(email=email, password=password)
        )

    def auth_user(self):
        email, password = 'joe@gmail.com', '123456'
        self.register_user(email, password)
        data, _ = self.login_user(email, password)
        return data['auth_token']