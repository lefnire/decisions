from functools import wraps
from flask import g, request, make_response, jsonify
from flask.views import MethodView

from project.server import app, db
from project.server import models as m
from project.server.auth.views import login_required


# These methods could be in a BaseView(MethodView) and inherited, but hunch() & score() below are floaters
# which need these.

def send(data, code=200):
    if 400 > code >= 200:
        return make_response(jsonify(dict(status='success', data=data))), code
    return make_response(jsonify(dict(status='fail', message=data))), code


def not_implemented():
    return send('Not Implemented', code=404)


def comparison_404():
    return send('Comparison not found', code=404)


class ComparisonAPI(MethodView):
    def get(self, id):
        """Get this user's comparison(s)"""
        # Comparison list
        if id is None:
            return send([join.comparison.to_json() for join in g.user.comparisons])

        comp = g.user.get_comparison(id)
        if not comp: return comparison_404()
        return send(comp.to_json())

    def post(self):
        """Create a new comparision"""
        join = g.user.create_comparison(**request.get_json())
        return send(join.comparison.to_json())

    def delete(self, id):
        comp = g.user.get_comparison(id)
        if not comp: return comparison_404()
        comp.destroy()
        return send({})

    def put(self, id):
        comp = g.user.get_comparison(id)
        if not comp: return comparison_404()

        # Have to update on query, not model
        comp = db.session.query(m.Comparison).filter_by(id=id)
        comp.update(request.get_json())
        db.session.commit()
        return send(comp.first().to_json())


class FeatureAPI(MethodView):
    def post(self, cid):
        if not g.user.get_comparison(cid): return comparison_404()
        feature = m.Feature(comparison_id=cid, **request.get_json())
        db.session.add(feature)
        db.session.commit()
        return send(feature.to_json())

    def get(self, cid, id):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()

        if id is None:
            return send([f.to_json() for f in comp.features])

        feature = db.session.query(m.Feature).filter_by(id=id).first()
        if not feature:
            return send('Feature not found', code=404)
        return send(feature.to_json())

    def delete(self, cid, id):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()

        feature = db.session.query(m.Feature).filter_by(id=id).first()
        if not feature:
            return send('Feature not found', code=404)
        db.session.delete(feature)
        db.session.commit()
        return send(feature.to_json())

    def put(self, cid, id):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()
        feature = db.session.query(m.Feature).filter_by(id=id)
        if not feature.first():
            return send('Feature not found', code=404)
        feature.update(request.get_json())
        db.session.commit()
        return send(feature.first().to_json())


class CandidateAPI(MethodView):
    def post(self, cid):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()
        candidate = m.Candidate(comparison_id=cid, **request.get_json())
        db.session.add(candidate)
        db.session.commit()
        return send(candidate.to_json())

    def get(self, cid, id):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()

        if id is None:
            return send(comp.get_candidates(to_dict=True))

        candidate = db.session.query(m.Candidate).filter_by(id=id).first()
        if not candidate:
            return send('Candidate not found', code=404)
        return send(candidate.to_json())

    def delete(self, cid, id):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()
        candidate = db.session.query(m.Candidate).filter_by(id=id).first()
        if not candidate:
            return send('Candidate not found', code=404)
        db.session.delete(candidate)
        db.session.commit()
        return send(candidate.to_json())

    def put(self, cid, id):
        comp = g.user.get_comparison(cid)
        if not comp: return comparison_404()
        candidate = db.session.query(m.Candidate).filter_by(id=id)
        if not candidate.first():
            return send('Candidate not found', code=404)
        candidate.update(request.get_json())
        db.session.commit()
        return send(candidate.first().to_json())


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