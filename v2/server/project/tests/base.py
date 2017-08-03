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

    def client_get(self, url, token={}):
        kwargs = {}
        if token:
            kwargs['headers'] = dict(
                Authorization='Bearer ' + token
            )
        resp = self.client.get(
            url,
            content_type='application/json',
            **kwargs
        )
        return json.loads(resp.data.decode()), resp

    def client_post(self, url, data={}, token=None):
        kwargs = {}
        if data:
            kwargs['data'] = json.dumps(data)
        if token:
            kwargs['headers'] = dict(
                Authorization='Bearer ' + token
            )
        resp = self.client.post(
            url,
            content_type='application/json',
            **kwargs
        )
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

    def auth(self):
        email, password = 'joe@gmail.com', '123456'
        self.register_user(email, password)
        data, _ = self.login_user(email, password)
        return data['auth_token']