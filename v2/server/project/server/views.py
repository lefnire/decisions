from flask import g

from project.server import app
from project.server import models as m
from project.server.auth.views import login_required

@app.route('/comparisons')
@login_required
def get_comparisons():
    """Get this user's comparisons"""
    return g.user.comparisons

@login_required
@app.route('/comparison/<id>')
def get_comparison(id):
    """Get a comparison and all that comes with"""
    pass