from functools import wraps
from flask import g, request, make_response, jsonify
from flask.views import MethodView

from project.server import app, db
from project.server import models as m
from project.server.auth.views import login_required


class BaseView(MethodView):
    def send(self, data, code=200):
        if 400 > code >= 200:
            return make_response(jsonify(dict(status='success', data=data))), code
        return make_response(jsonify(dict(status='fail', message=data))), code

    def not_impelmented(self):
        return self.send('Not Implemented', 404)

    def get_comparison(self, id):
        return db.session.query(m.UserComparison)\
            .filter_by(user_id=g.user.id, comparison_id=id).first()


class ComparisonAPI(BaseView):

    def get(self, id):
        """Get this user's comparison(s)"""
        # Comparison list
        if id is None:
            return self.send([c.comparison.to_json() for c in g.user.comparisons])

        comp = self.get_comparison(id)
        if not comp:
            return self.send('Comparison not found', code=404)
        return self.send(comp.comparison.to_json())

    def post(self):
        """Create a new comparision"""
        join = g.user.create_comparison(**request.get_json())
        return self.send(join.comparison.to_json())

    def delete(self, id):
        comp = self.get_comparison(id)
        if not comp:
            return self.send('Comparison not found', code=404)
        comp.destroy()
        return self.send(comp)

    def put(self, id):
        comp = self.get_comparison(id)
        if not comp:
            return self.send('Comparison not found', code=404)
        comp.update(**request.get_json())
        return self.send(comp)


class FeatureAPI(BaseView):
    def post(self, cid):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)
        feature = m.Feature(comparison_id=cid, **request.get_json())
        db.session.add(feature)
        db.session.commit()
        return self.send(feature.to_json())

    def get(self, cid, id):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)

        if id is None:
            features = db.session.query(m.Feature).filter_by(comparison_id=cid).all()
            return self.send([f.to_json() for f in features])

        feature = db.session.query(m.Feature).filter_by(id=id).first()
        if not feature:
            return self.send('Feature not found', code=404)
        return self.send(feature.to_json())

    def delete(self, cid, id):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)
        feature = db.session.query(m.Feature).filter_by(id=id).first()
        if not feature:
            return self.send('Feature not found', code=404)
        db.session.delete(feature)
        db.session.commit()
        return self.send(feature.to_json())

    def put(self, cid, id):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)
        feature = db.session.query(m.Feature).filter_by(id=id)
        if not feature.first():
            return self.send('Feature not found', code=404)
        feature.update(request.get_json())
        db.session.commit()
        return self.send(feature.first().to_json())


class CandidateAPI(BaseView):
    def post(self, cid):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)
        candidate = m.Candidate(comparison_id=cid, **request.get_json())
        db.session.add(candidate)
        db.session.commit()
        return self.send(candidate.to_json())

    def get(self, cid, id):
        join = self.get_comparison(cid)
        if not join:
            return self.send('Comparison not found', code=404)

        if id is None:
            candidates = join.comparison.scoreboard(to_dict=True)
            return self.send(candidates)

        candidate = db.session.query(m.Candidate).filter_by(id=id).first()
        if not candidate:
            return self.send('Candidate not found', code=404)
        return self.send(candidate.to_json())

    def delete(self, cid, id):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)
        candidate = db.session.query(m.Candidate).filter_by(id=id).first()
        if not candidate:
            return self.send('Candidate not found', code=404)
        db.session.delete(candidate)
        db.session.commit()
        return self.send(candidate.to_json())

    def put(self, cid, id):
        if not self.get_comparison(cid):
            return self.send('Comparison not found', code=404)
        candidate = db.session.query(m.Candidate).filter_by(id=id)
        if not candidate.first():
            return self.send('Candidate not found', code=404)
        candidate.update(request.get_json())
        db.session.commit()
        return self.send(candidate.first().to_json())


@app.route('/score/<candidate_id>/<feature_id>/<score>', methods=['POST'])
@login_required
def score(candidate_id, feature_id, score):
    g.user.score(candidate_id, feature_id, score)
    return jsonify({})


@app.route('/hunch/<candidate_id>/<score>', methods=['POST'])
@login_required
def hunch(candidate_id, score):
    g.user.hunch(candidate_id, score)
    return jsonify({})

def register_api(view, endpoint, url, pk='id'):
    view_func = login_required(view.as_view(endpoint))
    app.add_url_rule(url, defaults={pk: None}, view_func=view_func, methods=['GET',])
    app.add_url_rule(url, view_func=view_func, methods=['POST',])
    app.add_url_rule('%s<%s>' % (url, pk), view_func=view_func, methods=['GET', 'PUT', 'DELETE'])

register_api(ComparisonAPI, 'comparison_api', '/comparisons/', pk='id')
register_api(FeatureAPI, 'feature_api', '/comparisons/<cid>/features/', pk='id')
register_api(CandidateAPI, 'candidate_api', '/comparisons/<cid>/candidates/', pk='id')