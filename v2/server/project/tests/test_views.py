# project/tests/test_auth.py


import time
import json
import unittest

from project.server import db
from project.server.models import User, BlacklistToken
from project.tests.base import BaseTestCase


class TestAuthBlueprint(BaseTestCase):
    def test_registration(self):
        """ Test for user registration """
        with self.client:
            token = self.auth()


if __name__ == '__main__':
    unittest.main()
