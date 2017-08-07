//FIXME populate w/ scores on scoreCandidate
//FIXME show averages

import React, { Component } from 'react';
import {BrowserRouter as Router, Route, Link, Switch} from 'react-router-dom';
import {Table, Col, Button, Modal, FormGroup, ControlLabel, HelpBlock, FormControl, Panel, Alert, ButtonToolbar,
  Jumbotron, Navbar, Tooltip, Glyphicon, OverlayTrigger} from 'react-bootstrap';
import update from 'react-addons-update';
import _ from 'lodash';
import ReactStars from 'react-stars';
import ReactTable from 'react-table'
import {LinkContainer} from 'react-router-bootstrap';

// const SERVER = 'https://hiring-regression.herokuapp.com';
const SERVER = 'http://localhost:5000';
let user = localStorage.getItem('user');
user = user && JSON.parse(user);

class Auth extends Component {
  state = {
    showRegister: false,
    error: null,
    form: {}
  };
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  login = e => {
    e.preventDefault();
    _fetch('/auth/login', {method: 'POST', body: this.state.form}).then(json => {
      if (!json.auth_token) return this.setState({error: json.message});
      this.props.onAuth(json);
    });
    return false;
  };
  register = e => {
    e.preventDefault();
    let {form} = this.state;
    if (form.password !== form.confirmPassword)
      return this.setState({error: "Passwords don't match"});
    _fetch('/auth/register', {method: 'POST', body: form}).then(json => {
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
            <form onSubmit={this.register}>
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
          <form onSubmit={this.login}>
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
          <HelpBlock>Use a good email/password, no way to change it yet. @Kirill and other managers; tell Tyler when you've registered, I'll make you an admin - then you log out and back in.</HelpBlock>
        </Panel>
      </div>
    );
  }
}

class CandidateModal extends Component {
  state = {
    editing: false,
    form: {}
  };
  componentDidMount() {
    this.show(this.props.match.params.id);
  }
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  show = id => {
    const {comparison_id} = this.props;
    this.setState({editing: !!id, form: {links: []}});
    if (!!id) {
      _fetch(`/comparisons/${comparison_id}/candidates/${id}`).then(({data: form}) => {
        form.links = form.links || [];
        this.setState({form})
      });
    }
  };
  close = () => {
    const {comparison_id} = this.props;
    this.props.history.push(`/comparison/${comparison_id}`);
  };
  submit = e => {
    e.preventDefault();
    let {form, editing} = this.state;
    const {comparison_id} = this.props;
    let p = editing? _fetch(`/comparisons/${comparison_id}/candidates/${form.id}`, {method: 'PUT', body: form})
      : _fetch(`/comparisons/${comparison_id}/candidates/`, {method: 'POST', body: form});
    p.then(() => {
      this.close();
      this.props.fetch();
    });
    return false;
  };
  render() {
    let {form, editing} = this.state;
    return (
      <Modal show={true} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>{editing? form.title : 'Add Candidate'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={this.submit}>
            <FieldGroup
              id="candidateName"
              placeholder="Candidate Name"
              value={form.title}
              onChange={this.changeText.bind(this, 'title')}
            />
            <FieldGroup
              id="candidateNotes"
              componentClass="textarea"
              help="Any additional notes / comments you have about the candidate."
              placeholder="Notes"
              value={form.description}
              onChange={this.changeText.bind(this, 'description')}
            />
            <Panel header="Links">
              <HelpBlock>Any relevant links (AngelList, Github, Twitter, LinkedIn, etc). The first link will be the candidate's href. TODO: allow re-ordering, deleting, etc.</HelpBlock>
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
            <Button className="pull-right" bsStyle="primary" type="submit">Submit</Button>
            <div className="clearfix" />
          </form>
        </Modal.Body>
      </Modal>
    );
  }
}

class FeatureModal extends Component {
  state = {
    editing: false,
    form: {}
  };
  componentDidMount() {
    this.show(this.props.match.params.id);
  }
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  changeStar = (val) => this.setState(update(this.state, {form: {weight: {$set: val}}}));
  close = () => {
    const {comparison_id} = this.props;
    this.props.history.push(`/comparison/${comparison_id}`);
  };
  show = id => {
    this.setState({editing: !!id, form: {}});
    const {comparison_id} = this.props;
    if (!!id) {
      _fetch(`/comparisons/${comparison_id}/features/${id}`)
        .then(({data}) => this.setState({form: data}));
    }
  };
  submit = e => {
    e.preventDefault();
    const cid = this.props.comparison_id;
    let {form, editing} = this.state;
    let p = editing? _fetch(`/comparisons/${cid}/features/${form.id}`, {method: "PUT" , body: form})
      : _fetch(`/comparisons/${cid}/features/`, {method: 'POST', body: this.state.form});
    p.then(() => {
      this.close();
      this.props.fetch();
    });
    return false;
  };
  render() {
    let {form, editing} = this.state;
    return (
      <Modal show={true} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>{editing? form.title : 'Add Feature'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={this.submit}>
            <FieldGroup
              id="featureTitle"
              placeholder="Title"
              value={form.title}
              help="Short title, like '10yrs Experience'"
              onChange={this.changeText.bind(this, 'title')}
            />
            <FieldGroup
              id="featureDescription"
              placeholder="Description"
              componentClass="textarea"
              value={form.description}
              help="Notes about this feature; eg, more details about the type of experience, what to look for on a resume, etc."
              onChange={this.changeText.bind(this, 'description')}
            />
            <label>Importance</label>
            <ReactStars
              half={false}
              onChange={this.changeStar}
              id="featureWeight"
              value={form.weight}
            />
            <span className="help-block">Number between 1-5 on how important this feature is. 5 for 'required', 1 for 'not that important'.</span>
            <Button className="pull-right" bsStyle="primary" type="submit">Submit</Button>
            <div className="clearfix" />
          </form>
        </Modal.Body>
      </Modal>
    );
  }
}

class ComparisonModal extends Component {
  state = {
    editing: false,
    form: {}
  };

  componentDidMount() {
    this.show(this.props.match.params.comparison_id);
  }

  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  close = () => this.props.history.push('/comparisons');
  show = id => {
    this.setState({editing: !!id, form: {}});
    if (!!id) {
      _fetch(`/comparisons/${id}`).then(({data}) => {
        this.setState({form: _.pick(data, ['id', 'title', 'description'])})
      });
    }
  };
  submit = e => {
    e.preventDefault();
    let {form, editing} = this.state;
    let p = editing? _fetch(`/comparisons/${form.id}`, {method: "PUT" , body: form})
      : _fetch(`/comparisons/`, {method: 'POST', body: this.state.form});
    p.then(this.close).then(this.props.refresh);
    return false;
  };
  render() {
    let {form, editing} = this.state;
    return (
      <Modal show={true} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>{editing? form.title : 'Add Comparison'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={this.submit}>
            <FieldGroup
              id="comparisonTitle"
              placeholder="Title"
              value={form.title}
              help="Short title, like 'Which job to take?'"
              onChange={this.changeText.bind(this, 'title')}
            />
            <FieldGroup
              id="featureDescription"
              placeholder="Description"
              componentClass="textarea"
              value={form.description}
              help="Optional notes about this comparison; eg, more details about the decision you're trying to make."
              onChange={this.changeText.bind(this, 'description')}
            />
            <Button className="pull-right" bsStyle="primary" type="submit">Submit</Button>
            <div className="clearfix" />
          </form>
        </Modal.Body>
      </Modal>
    );
  }
}

class CandidateSub extends Component {
  deleteCandidate = () => {
    const {comparison_id, candidate} = this.props;
    if (confirm('Delete this candidate?')) {
      _fetch(`/comparisons/${comparison_id}/candidates/${candidate.id}`, {method: "DELETE"})
        .then(this.props.fetch);
    }
  };

  getFeature = (feature_id, key) => _.get(_.find(this.props.candidate.features, {feature_id}), key);

  onChangeStar = (fid, val) => {
    const {comparison_id, candidate} = this.props;
    _fetch(`/score/${candidate.id}/${fid}/${val}`, {method: "POST"}); // FIXME then-refresh closes expander, using "done" button workaround
  };
  renderScoreCell = ({original: feature}) => (
    <ReactStars
      half={false}
      value={this.getFeature(feature.id, 'score')}
      onChange={val => this.onChangeStar(feature.id, val)}
    />
  );

  renderScoresTable = () => {
    const {features, candidate: c} = this.props;
    const columns = [{
      Header: 'Feature',
      accessor: 'title'
    }, {
      Header: 'Score',
      Cell: this.renderScoreCell
    }, {
      Header: 'Weighted',
      Cell: ({original: feature}) => this.getFeature(feature.id, 'weighted_score')
    }];

    return (
      <ReactTable
        className="margins"
        data={features}
        columns={columns}
        minRows={0}
        showPagination={false}
        SubComponent={this.renderCandidateSub}
      />
    );
  };

  render() {
    const {comparison_id, features, candidate: c} = this.props;
    return (
      <div className="margins">
        {/*c.links && c.links[0]? <a href={c.links[0]} target="_blank">{c.title}</a> : c.title*/}
        {c.description && <small>{c.description}</small>}
        {this.renderScoresTable()}
        <div className="clearfix" />
        <ButtonToolbar className="pull-right">
          <Button bsSize="xsmall" bsStyle="primary" onClick={this.props.fetch}>Done</Button>
          <LinkContainer to={`/comparison/${comparison_id}/candidate/${c.id}`}>
            <Button bsSize="xsmall">Edit</Button>
          </LinkContainer>
          <Button bsStyle="danger" bsSize="xsmall" onClick={this.deleteCandidate}>Delete</Button>
        </ButtonToolbar>
      </div>
    );
  }
}

class FeatureSub extends Component {
  deleteFeature = () => {
    const {feature, comparison_id} = this.props;
    if (confirm('Delete this feature?')) {
      _fetch(`/comparisons/${comparison_id}/features/${feature.id}`, {method: "DELETE"})
        .then(this.props.fetch);
    }
  };

  render() {
    const {comparison_id, feature: f} = this.props;
    return (
      <div className="margins">
        {f.description && <small>{f.description}</small>}
        <div className="clearfix" />
        <ButtonToolbar className="pull-right">
          <LinkContainer to={`/comparisons/${comparison_id}/feature/${f.id}`}>
            <Button bsSize="xsmall">Edit</Button>
          </LinkContainer>
          <Button bsStyle="danger" bsSize="xsmall" onClick={this.deleteFeature}>Delete</Button>
        </ButtonToolbar>
      </div>
    )
  }
}

class Comparison extends Component {
  constructor() {
    super();
    this.state = {
      candidates: [],
      features: []
    };
  }

  fetch = () => {
    const cid = this.props.match.params.comparison_id;
    Promise.all([
      _fetch(`/comparisons/${cid}/candidates/`),
      _fetch(`/comparisons/${cid}/features/`)
    ]).then(arr => {
      // console.log(arr);
      this.setState({candidates: arr[0].data, features: arr[1].data});
    });
  };

  componentDidMount() {
    this.fetch();
  }

  renderCandidateSub = ({original}) => (
    <CandidateSub
      candidate={original}
      features={this.state.features}
      fetch={this.fetch}
      comparison_id={this.props.match.params.comparison_id}
    />
  );
  renderScoreCell = ({original}) => {
    const {features} = this.state;
    const allFeaturesScored = _.reduce(features, (acc, feature) => {
      return acc && _.find(original.features, {feature_id: feature.id});
    }, true);
    if (allFeaturesScored) {return original.score;}
    return (
      <div>
        <OverlayTrigger
          placement="right"
          overlay={<Tooltip id="score-all-features">Please score all features</Tooltip>}
        >
          <Glyphicon glyph="alert" />
        </OverlayTrigger>
      </div>
    );
  };
  renderHunchCell = ({original}) => (
    <div>
      <div className="pull-right">{original.hunch}</div>
      <ReactStars
        half={false}
        value={original.last_hunch}
        onChange={val => _fetch(`/hunch/${original.id}/${val}`, {method: 'POST'})
          .then(this.fetch)
        }
      />
    </div>
  );
  renderCandidates = () => {
    const {match} = this.props;
    const {candidates} = this.state;
    const columns = [{
      Header: 'Name',
      accessor: 'title'
    }, {
      Header: 'Score',
      id: 'score',
      Cell: this.renderScoreCell
    }, {
      Header: 'Hunch',
      accessor: 'hunch',
      Cell: this.renderHunchCell
    }, {
      Header: 'Combined',
      accessor: 'combined'
    }];

    return (
      <Col md={6}>
        <h3>Candidates</h3>
        <ReactTable
          data={candidates}
          columns={columns}
          minRows={0}
          showPagination={false}
          SubComponent={this.renderCandidateSub}
        />
        <LinkContainer
          className="margin-top pull-right"
          to={match.url + `/candidate`}
        >
          <Button bsStyle="primary">Add Candidate</Button>
        </LinkContainer>
      </Col>
    );
  };

  onChangeFeatureWeight = (feature, val) => {
    const {comparison_id} = this.props.match.params;
    feature.weight = val;
    _fetch(`/comparisons/${comparison_id}/features/${feature.id}`, {method: "PUT", body: feature})
      .then(this.fetch)
  };
  renderFeatureWeight = ({original}) => (
    <ReactStars
      value={original.weight}
      half={false}
      onChange={val => this.onChangeFeatureWeight(original, val)}
    />
  );
  renderFeatureSub = ({original}) => (
    <FeatureSub
      feature={original}
      fetch={this.fetch}
      comparison_id={this.props.match.params.comparison_id}
    />
  );
  renderFeatures = () => {
    const {comparison_id} = this.props.match.params;
    const {features} = this.state;
    const columns = [{
      Header: 'Name',
      accessor: 'title'
    }, {
      Header: 'Importance',
      accessor: 'weight',
      Cell: this.renderFeatureWeight
    }];

    return (
      <Col md={6}>
        <h3>Features</h3>
        <ReactTable
          data={features}
          columns={columns}
          minRows={0}
          showPagination={false}
          SubComponent={this.renderFeatureSub}
        />
        <LinkContainer
          className="margin-top pull-right"
          to={`/comparison/${comparison_id}/feature`}
        >
          <Button bsStyle="primary">Add Feature</Button>
        </LinkContainer>
      </Col>
    );
  };

  render() {
    const {match} = this.props;
    const {comparison_id} = match.params;
    console.log({comparison_id});
    return (
      <div>
        {this.renderCandidates()}
        {this.renderFeatures()}
        <Route
          path={match.url + '/feature/:id?'}
          render={(props) => (
            <FeatureModal fetch={this.fetch} comparison_id={comparison_id} {...props} />
          )}
        />
        <Route
          path={match.url + '/candidate/:id?'}
          render={(props) => (
            <CandidateModal fetch={this.fetch} comparison_id={comparison_id} {...props} />
          )}
        />

      </div>
    );
  }
}

class Comparisons extends Component {
  state = {
    comparisons: []
  };

  componentDidMount() {
    this.fetch();
  }

  fetch = () => {
    _fetch('/comparisons/').then(({data}) => this.setState({comparisons: data}));
  };

  deleteComparison = (id) => {
    _fetch(`/comparisons/${id}`, {method: 'DELETE'}).then(this.fetch);
  };

  render() {
    const columns = [{
      Header: 'Name',
      accessor: 'title',
      Cell: ({original: c}) => <Link to={`/comparison/${c.id}`}>{c.title}</Link>
    }, {
      Header: '',
      Cell: ({original: c}) => (
        <ButtonToolbar>
          <LinkContainer to={`/comparisons/edit/${c.id}`}>
            <Button bsSize="xsmall">Edit</Button>
          </LinkContainer>
          <Button
            bsStyle="danger" bsSize="xsmall"
            onClick={() => this.deleteComparison(c.id)}
          >Delete</Button>
        </ButtonToolbar>
      )
    }];

    return (
      <div>
        <ReactTable
          data={this.state.comparisons}
          columns={columns}
          minRows={0}
          showPagination={false}
        />
        <LinkContainer to="/comparisons/create">
          <Button
            className="margin-top pull-right"
            bsStyle="primary"
          >Add Comparison</Button>
        </LinkContainer>
        <Route
          path="/comparisons/create"
          render={(props) => <ComparisonModal fetch={this.fetch} {...props} />}
        />
        <Route
          path="/comparisons/edit/:comparison_id"
          render={(props) => <ComparisonModal fetch={this.fetch} {...props} />}
        />
      </div>
    )
  }
}

class App extends Component {
  onAuth = _user => {
    user = _user;
    localStorage.setItem('user', JSON.stringify(user));
    window.location.href = '/comparisons';
  };

  logout = e => {
    e.preventDefault();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  renderNavbar = () => (
    <Navbar>
      <Navbar.Header>
        <Navbar.Brand>
          <Link to="/comparisons">Decisioneer</Link>
        </Navbar.Brand>
        <Navbar.Toggle />
      </Navbar.Header>
      <Navbar.Collapse>
        <Navbar.Text>
          <LinkContainer to="/comparisons">
            <Navbar.Link>Comparisons</Navbar.Link>
          </LinkContainer>
        </Navbar.Text>
        <Navbar.Text pullRight>
            <Navbar.Link href="#" onClick={this.logout}>Logout</Navbar.Link>
        </Navbar.Text>
      </Navbar.Collapse>
    </Navbar>
  );

  render() {
    if (!user) {
      return <Auth onAuth={this.onAuth} />;
    }

    if (window.location.pathname === '/') {
      window.location.href = '/comparisons';
      return;
    }

    return (
      <Router>
        <div>
          {this.renderNavbar()}
          <div className="container-fluid">
            <Switch>
              <Route path="/comparisons" component={Comparisons} />
              <Route path="/comparison/:comparison_id" component={Comparison} />
            </Switch>
          </div>
        </div>
      </Router>
    )
  }
}

function _fetch (url, data={}) {
  _.defaults(data, {method: 'GET', headers: {}});
  _.defaults(data.headers, {'Content-Type': 'application/json'});
  if (user) data.headers['Authorization'] = 'Bearer ' + user.auth_token;
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
