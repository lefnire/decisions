const expect = require('expect.js'),
  app = require('./app'),
  _ = require('lodash'),
  nconf = require('nconf'),
  fetch = require('isomorphic-fetch');

const SERVER = 'http://localhost:3001';
nconf.argv().env().file({ file: 'config.json' });

function _fetch(url, data={}) {
  _.defaults(data, {method: 'GET', headers: {}});
  _.defaults(data.headers, {'Content-Type': 'application/json'});
  if (data.body) data.body = JSON.stringify(data.body);
  return fetch(url, data).then(res => res.json()); //.catch(e => console.log("Error: ", e));
}

describe("App", () => {
  before(done => {
    app.then(() => done());
  });

  it("Anon can't create features", done => {
    _fetch(SERVER + '/features', {
      method: "POST",
      body: {a:1}
    }).then(json => {
      expect(json.message).to.be('No token provided.');
      done();
    });
  });

  it('Creates a feature', (done) => {
    let headers, feature;

    // Register
    _fetch(SERVER + '/register', {method: 'POST', body: {
      email: 'x@y.com',
      password: 'abc'
    }}).then(json => {
      expect(json.token).to.be.ok();
      return _fetch(SERVER + '/login', {method: "POST", body: {
        email: 'bad@y.com',
        password: 'abc'
      }});
    }).then(json => {
      expect(json.message).to.contain('failed');
      return _fetch(SERVER + '/login', {method: "POST", body: {
        email: "x@y.com",
        password: 'bad'
      }})
    }).then(json => {
      expect(json.message).to.contain('failed');
      return _fetch(SERVER + '/login', {method: "POST", body: {
        email: 'x@y.com',
        password: 'abc'
      }})
    }).then(json => {
      expect(json.token).to.be.ok();
      headers = {'x-access-token': json.token};

    // Features

      // Create
      return _fetch(SERVER + '/features', {method: "POST", headers, body: {
        title: "10 yrs experience",
        description: "Candidate must have 10 years of experience",
        weight: 100
      }});
      // Read
    }).then(f => {
      expect(f.title).to.contain('10 yrs');
      feature = f;
      return _fetch(SERVER + '/features', {headers});
    }).then(f => {
      expect(f.length).to.be(1);
      return _fetch(SERVER + '/features/' + feature.id, {headers});
      // Update
    }).then(f => {
      expect(f.title).to.be(feature.title);
      return _fetch(SERVER + '/features/' + feature.id, {method: 'PUT', headers, body: {
        title: 'Updated'
      }});
    }).then(f => {
      expect(f.title).to.be('Updated');

      // Destroy
      return _fetch(SERVER + '/features/' + feature.id, {method: "DELETE", headers});
    }).then(f => {
      return _fetch(SERVER + '/features', {headers});
    }).then(f => {
      expect(f.length).to.be(0);


    //   // Scores
    //   //FIXME ensure candidate, user, feature exists
    //
    //   return _fetch(SERVER + '/score/1/2/3', {method: "POST", headers});
    // }).then(s => {
    //   expect(s.user_id).to.be(1);
    //   expect(s.candidate_id).to.be(1);
    //   expect(s.feature_id).to.be(2);
    //   expect(s.score).to.be(3);

      // Now let's start futzing manaully with some stuff
      let Score = sequelize.model('scores'),
        Candidate = sequelize.model('candidates'),
        Feature = sequelize.model('features');
      return sequelize.query(`DELETE FROM scores`).then(() => Promise.all([
        Candidate.bulkCreate([{name: 'A'}, {name: 'B'}, {name: 'C'}]),
        Feature.bulkCreate([
          {title: 'A', weight: 1},
          {title: 'B', weight: 1},
          {title: 'C', weight: 1}
        ])
      ])).then(() => Score.bulkCreate([
          // Create an average of 2 on c:1 f:1
          {user_id: 1, candidate_id: 1, feature_id: 2, score: 1},
          {user_id: 2, candidate_id: 1, feature_id: 2, score: 2},
          {user_id: 3, candidate_id: 1, feature_id: 2, score: 3},

          // Create an average of 6 on c:2 f:2
          {user_id: 1, candidate_id: 2, feature_id: 3, score: 2},
          {user_id: 2, candidate_id: 2, feature_id: 3, score: 4},
          {user_id: 3, candidate_id: 2, feature_id: 3, score: 6},
      ]));
    }).then(() => _fetch(SERVER + '/candidates', {headers})).then(json => {
      console.log('json', json);
      done();
    }).catch(e => console.log('Exception: ', e));
  });
});