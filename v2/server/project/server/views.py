from flask import request

from project.server import app
from project.server import models as m

@app.route('/comparisons')
def get_comparisons():
    """Get this user's comparisons"""
    pass

@app.route('/comparison/<id>')
def get_comparison(id):
    """Get a comparison and all that comes with"""
    pass