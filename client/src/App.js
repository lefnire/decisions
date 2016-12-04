//FIXME populate w/ scores on scoreCandidate
//FIXME show averages

import React, { Component } from 'react';
import {Table, Col, Button, Modal, FormGroup, ControlLabel, HelpBlock, FormControl, Panel, Alert, ButtonToolbar} from 'react-bootstrap';
import update from 'react-addons-update';
import _ from 'lodash';

const SERVER = 'http://localhost:3001';
let user = localStorage.getItem('user');
user = user && JSON.parse(user);
console.log(user);

class Auth extends Component {
  state = {
    showRegister: false,
    error: null,
    form: {}
  };
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  login = e => {
    e.preventDefault();
    _fetch('/login', {method: 'POST', body: this.state.form}).then(json => {
      if (json.message) return this.setState({error: json.message});
      this.props.onAuth(json);
    });
    return false;
  };
  register = e => {
    e.preventDefault();
    let {form} = this.state;
    if (form.password !== form.confirmPassword)
      return this.setState({error: "Passwords don't match"});
    _fetch('/register', {method: 'POST', body: form}).then(json => {
      if (json.message) return this.setState({error: json.message});
      this.props.onAuth(json);
    });
    return false;
  };
  toggleScreen = () => this.setState({showRegister: !this.state.showRegister});
  render() {
    let {form, showRegister, error} = this.state;
    return (
      <div className="container">
        <Panel header="Log In">
          {error && (<Alert bsStyle="danger">{error}</Alert>)}
          {showRegister? (
            <form noValidate onSubmit={this.register}>
              <FieldGroup
                id="email"
                placeholder="Email"
                value={form.email}
                onChange={this.changeText.bind(this, 'email')}
              />
              <FieldGroup
                id="password"
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={this.changeText.bind(this, 'password')}
              />
              <FieldGroup
                id="confirmPassword"
                type="password"
                placeholder="Confirm Password"
                value={form.confirmPassword}
                onChange={this.changeText.bind(this, 'confirmPassword')}
              />
              <Button type="submit">Submit</Button>
            </form>
          ) : (
          <form noValidate onSubmit={this.login}>
            <FieldGroup
              id="email"
              placeholder="Email"
              value={form.email}
              onChange={this.changeText.bind(this, 'email')}
            />
            <FieldGroup
              id="password"
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={this.changeText.bind(this, 'password')}
            />
            <Button type="submit">Submit</Button>
          </form>
          )}
          <br/>
          <a onClick={this.toggleScreen}>{showRegister? "Login" : "Register"}</a>
        </Panel>
      </div>
    );
  }
}

class ScoreCandidateModal extends Component {
  state = {
    show: false,
    form: {}
  };
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  show = id => {
    this.setState({show: true, form: {}});
    Promise.all([
      _fetch('/candidates/' + id),
      _fetch('/features')
    ]).then(arr => {
      this.setState({
        candidate: arr[0],
        features: arr[1]
      });
    });
  };
  close = () => this.setState({show: false});
  submit = e => {
    e.preventDefault();
    let {form, candidate} = this.state;
    //FIXME add a bulk-update route
    Promise.all(_.transform(form, (m,v,k) => {
      m.push(_fetch(`/score/${candidate.id}/${k}/${v}`, {method: "POST"}));
      return m;
    }, [])).then(() => {
      this.close();
      this.props.refresh();
    });
    return false;
  };
  render() {
    let {form, show, candidate, features} = this.state;
    return (
      <Modal show={show} onHide={this.close}>
        {candidate && (<div>
        <Modal.Header closeButton>
          <Modal.Title>{candidate.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form noValidate onSubmit={this.submit}>
            {features.map(f => (
              <FieldGroup
                key={f.id}
                id={"score_" + f.id}
                placeholder={f.title}
                value={form[f.id]}
                onChange={this.changeText.bind(this, f.id)}
                help={f.description}
              />
            ))}
            <Button type="submit">Score</Button>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
        </div>)}
      </Modal>
    );
  }
}

class CandidateModal extends Component {
  state = {
    editing: false,
    show: false,
    form: {}
  };
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  show = id => {
    this.setState({show: true, editing: !!id, form: {links: []}});
    if (!!id) {
      _fetch('/candidates/' + id).then(form => {
        form.links = form.links || [];
        this.setState({form})
      });
    }
  };
  close = () => this.setState({show: false});
  submit = e => {
    e.preventDefault();
    let {form, editing} = this.state;
    let p = editing? _fetch('/candidates/' + form.id, {method: 'PUT', body: form})
      : _fetch('/candidates', {method: 'POST', body: form});
    p.then(() => {
      this.close();
      this.props.refresh();
    });
    return false;
  };
  render() {
    let {form, show, editing} = this.state;
    return (
      <Modal show={show} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>{editing? form.name : 'Add Candidate'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form noValidate onSubmit={this.submit}>
            <FieldGroup
              id="candidateName"
              placeholder="Candidate Name"
              value={form.name}
              onChange={this.changeText.bind(this, 'name')}
            />
            <FieldGroup
              id="candidateDescription"
              componentClass="textarea"
              placeholder="Notes"
              value={form.description}
              onChange={this.changeText.bind(this, 'description')}
            />
            <Panel header="Links">
              <ul>
                {form.links && form.links.map((link, i) => (
                  <FieldGroup
                    key={'candidateLink' + i}
                    id={"candidateLink" + i}
                    placeholder="Link"
                    value={link}
                    onChange={e => this.setState(update(this.state, {form: {links: {[i]: {$set: e.target.value}}}}))}
                  />
                ))}
              </ul>
              <Button bsSize="xsmall" onClick={() => this.setState(update(this.state, {form: {links: {$push: ['']}}}))}>Add Link</Button>
            </Panel>
            <Button type="submit">Submit</Button>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

class FeatureModal extends Component {
  state = {
    editing: false,
    show: false,
    form: {}
  };
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  close = () => this.setState({show: false});
  show = id => {
    this.setState({show: true, editing: !!id, form: {}});
    if (!!id) {
      _fetch('/features/' + id).then(form => this.setState({form}));
    }
  };
  submit = e => {
    e.preventDefault();
    let {form, editing} = this.state;
    let p = editing? _fetch(`/features/` + form.id, {method: "PUT" , body: form})
      : _fetch('/features', {method: 'POST', body: this.state.form});
    p.then(() => {
      this.close();
      this.props.refresh();
    });
    return false;
  };
  render() {
    let {form, editing, show} = this.state;
    return (
      <Modal show={show} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>{form.id? form.title : 'Add Feature'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form noValidate onSubmit={this.submit}>
            <FieldGroup
              id="featureTitle"
              placeholder="Title"
              value={form.title}
              onChange={this.changeText.bind(this, 'title')}
            />
            <FieldGroup
              id="featureDescription"
              placeholder="Description"
              value={form.description}
              onChange={this.changeText.bind(this, 'description')}
            />
            <FieldGroup
              id="featureWeight"
              placeholder="Weight"
              value={form.weight}
              onChange={this.changeText.bind(this, 'weight')}
            />
            <Button type="submit">Submit</Button>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

class App extends Component {
  state = {
    candidates: [],
    features: [],
    login: {}
  };

  fetchStuff = () => {
    Promise.all([
      _fetch('/candidates'),
      _fetch('/features')
    ]).then(arr => {
      // console.log(arr);
      this.setState({candidates: arr[0], features: arr[1]});
    });
  };

  componentDidMount() {
    if (user) this.fetchStuff();
  }

  onAuth = _user => {
    user = _user;
    localStorage.setItem('user', JSON.stringify(user));
    this.fetchStuff();
  };

  showScoreCandidate = id => this.refs.scoreCandidateModal.show(id);
  showFeature = id => this.refs.featureModal.show(id);
  showCandidate = id => this.refs.candidateModal.show(id);
  deleteFeature = id => {
    if (confirm('Delete this feature?')) {
      _fetch('/features/' + id, {method: "DELETE"}).then(() => this.fetchStuff());
    }
  };
  deleteCandidate = id => {
    if (confirm('Delete this candidate?')) {
      _fetch('/candidates/' + id, {method: "DELETE"}).then(() => this.fetchStuff());
    }
  };

  render() {
    if (!user) return <Auth onAuth={this.onAuth} />;
    let {candidates, features} = this.state;
    let isAdmin = user.role === 'admin';
    return (
      <div className="container">
        <CandidateModal ref="candidateModal" refresh={this.fetchStuff} />
        <FeatureModal ref="featureModal" refresh={this.fetchStuff} />
        <ScoreCandidateModal ref="scoreCandidateModal" refresh={this.fetchStuff} />
        <Col md={6}>
          <h3>Candidates</h3>
          <Table striped bordered condensed hover>
            <thead><tr>
              <th>Name</th>
              <th>Score</th>
              <th></th>
            </tr></thead>
            <tbody>
              {candidates.map(c => (
                <tr key={c.id}>
                  <td>{c.links && c.links[0]? <a href={c.links[0]} target="_blank">{c.name}</a> : c.name}</td>
                  <td>{c.score}</td>
                  <td>
                    <ButtonToolbar>
                      <Button bsStyle="primary" bsSize="xsmall" onClick={this.showScoreCandidate.bind(this, c.id)}>Score</Button>
                      {isAdmin && <Button bsSize="xsmall" onClick={this.showCandidate.bind(this, c.id)}>Edit</Button>}
                      {isAdmin && <Button bsStyle="danger" bsSize="xsmall" onClick={this.deleteCandidate.bind(this, c.id)}>Delete</Button>}
                    </ButtonToolbar>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button onClick={() => this.showCandidate()}>Add Candidate</Button>
        </Col>
        <Col md={6}>
          <h3>Features</h3>
          <Table striped bordered condensed hover>
            <thead><tr>
              <th>Feature</th>
              <th>Weight</th>
              <th></th>
            </tr></thead>
            <tbody>
              {features.map(f => (
                <tr key={f.id}>
                  <td>{f.title}</td>
                  <td>{f.weight}</td>
                  <td>
                    {isAdmin && <ButtonToolbar>
                      <Button bsSize="xsmall" onClick={this.showFeature.bind(this, f.id)}>Edit</Button>
                      <Button bsStyle="danger" bsSize="xsmall" onClick={this.deleteFeature.bind(this, f.id)}>Delete</Button>
                    </ButtonToolbar>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button onClick={() => this.showFeature()}>Add Feature</Button>
        </Col>
      </div>
    );
  }
}

function _fetch (url, data={}) {
  _.defaults(data, {method: 'GET', headers: {}});
  _.defaults(data.headers, {'Content-Type': 'application/json'});
  if (user) data.headers['x-access-token'] = user.token;
  if (data.body) data.body = JSON.stringify(data.body);
  return fetch(SERVER + url, data).then(res => res.json()); //.catch(e => console.log("Error: ", e));
}

function FieldGroup ({ id, label, help, ...props }) {
  return (
    <FormGroup controlId={id}>
      <ControlLabel>{label}</ControlLabel>
      <FormControl {...props} />
      {help && <HelpBlock>{help}</HelpBlock>}
    </FormGroup>
  );
}

export default App;
