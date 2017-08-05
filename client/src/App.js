//FIXME populate w/ scores on scoreCandidate
//FIXME show averages

import React, { Component } from 'react';
import {
  BrowserRouter as Router,
    Route,
    Link
} from 'react-router-dom';
import {Table, Col, Button, Modal, FormGroup, ControlLabel, HelpBlock, FormControl, Panel, Alert, ButtonToolbar,
  Jumbotron, Navbar, Tooltip, Glyphicon, OverlayTrigger} from 'react-bootstrap';
import update from 'react-addons-update';
import _ from 'lodash';
import ReactStars from 'react-stars';
import ReactTable from 'react-table'

// const SERVER = 'https://hiring-regression.herokuapp.com';
const SERVER = 'http://localhost:5000';
let user = localStorage.getItem('user');
user = user && JSON.parse(user);

let candidateModal, featureModal;

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
    show: false,
    form: {}
  };
  changeText = (key, e) => this.setState(update(this.state, {form: {[key]: {$set: e.target.value}}}));
  show = id => {
    const cid = this.props.comparison_id;
    this.setState({show: true, editing: !!id, form: {links: []}});
    if (!!id) {
      _fetch(`/comparisons/${cid}/candidates/${id}`).then(data => {
        const form = data.data;
        form.links = form.links || [];
        this.setState({form})
      });
    }
  };
  close = () => this.setState({show: false});
  submit = e => {
    e.preventDefault();
    let {form, editing} = this.state;
    const cid = this.props.comparison_id;
    let p = editing? _fetch(`/comparisons/${cid}/candidates/${form.id}`, {method: 'PUT', body: form})
      : _fetch(`/comparisons/${cid}/candidates/`, {method: 'POST', body: form});
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
  changeStar = (val) => this.setState(update(this.state, {form: {weight: {$set: val}}}));
  close = () => this.setState({show: false});
  show = id => {
    this.setState({show: true, editing: !!id, form: {}});
    const cid = this.props.comparison_id;
    if (!!id) {
      _fetch(`/comparisons/${cid}/features/${id}`).then(data => this.setState({form: data.data}));
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

class CandidateSub extends Component {
  showCandidate = () => candidateModal.show(this.props.candidate.id);
  deleteCandidate = () => {
    const {comparison_id, candidate} = this.props;
    if (confirm('Delete this candidate?')) {
      _fetch(`/comparisons/${comparison_id}/candidates/${candidate.id}`, {method: "DELETE"}).then(this.props.refresh);
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
      Header: 'Weighted Score',
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
    const {features, candidate: c} = this.props;
    return (
      <div className="margins">
        {/*c.links && c.links[0]? <a href={c.links[0]} target="_blank">{c.title}</a> : c.title*/}
        {c.description && <small>{c.description}</small>}
        {this.renderScoresTable()}
        <div className="clearfix" />
        <ButtonToolbar className="pull-right">
          <Button bsSize="xsmall" bsStyle="primary" onClick={this.props.refresh}>Done</Button>
          <Button bsSize="xsmall" onClick={this.showCandidate}>Edit</Button>
          <Button bsStyle="danger" bsSize="xsmall" onClick={this.deleteCandidate}>Delete</Button>
        </ButtonToolbar>
      </div>
    );
  }
}

class FeatureSub extends Component {
  showFeature = () => featureModal.show(this.props.feature.id);

  deleteFeature = () => {
    const {feature, comparison_id} = this.props;
    if (confirm('Delete this feature?')) {
      _fetch(`/comparisons/${comparison_id}/features/${feature.id}`, {method: "DELETE"}).then(this.props.refresh);
    }
  };

  render() {
    const {feature: f} = this.props;
    return (
      <div className="margins">
        {f.description && <small>{f.description}</small>}
        <div className="clearfix" />
        <ButtonToolbar className="pull-right">
          <Button bsSize="xsmall" onClick={this.showFeature}>Edit</Button>
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
      features: [],
      hunches: null
    };
  }

  fetchStuff = () => {
    const cid = this.props.match.params.comparison_id;
    Promise.all([
      _fetch(`/comparisons/${cid}/candidates/`),
      _fetch(`/comparisons/${cid}/features/`)
    ]).then(arr => {
      // console.log(arr);
      this.setState({candidates: arr[0].data, features: arr[1].data});
    });
    setTimeout(() => {
      _fetch(`/comparisons/${cid}/hunches/`).then(({data}) => {
        this.setState({hunches: data});
      })
    });
  };

  componentDidMount() {
    this.fetchStuff();
  }

  renderCandidateSub = ({original}) => (
    <CandidateSub
      candidate={original}
      features={this.state.features}
      refresh={this.fetchStuff}
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
    <ReactStars
      half={false}
      onChange={val => _fetch(`/hunch/${original.id}/${val}`, {method: 'POST'}).then(this.fetchStuff)}
    />
  );
  renderCandidates = () => {
    const {candidates} = this.state;
    const columns = [{
      Header: 'Name',
      accessor: 'title'
    }, {
      Header: 'Weighted Score',
      id: 'weighted-score',
      Cell: this.renderScoreCell
    }, {
      Header: 'Hunch',
      id: 'hunch',
      Cell: this.renderHunchCell
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
        <Button
          bsStyle="primary"
          className="margin-top pull-right"
          onClick={() => candidateModal.show()}
        >Add Candidate</Button>
      </Col>
    );
  };

  onChangeFeatureWeight = (feature, val) => {
    const cid = this.props.match.params.comparison_id;
    feature.weight = val;
    _fetch(`/comparisons/${cid}/features/${feature.id}`, {method: "PUT", body: feature}).then(this.fetchStuff)
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
      refresh={this.fetchStuff}
      comparison_id={this.props.match.params.comparison_id}
    />
  );
  renderFeatures = () => {
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
        <Button
          className="margin-top pull-right"
          onClick={() => featureModal.show()}
          bsStyle="primary"
        >Add Feature</Button>
      </Col>
    );
  };

  render() {
    const cid = this.props.match.params.comparison_id;
    return (
      <div>
        <CandidateModal ref={c => candidateModal = c} refresh={this.fetchStuff} comparison_id={cid} />
        <FeatureModal ref={c => featureModal = c} refresh={this.fetchStuff} comparison_id={cid} />
        {this.renderCandidates()}
        {this.renderFeatures()}
        <h3>Hunch Board</h3>
        {this.state.hunches}
      </div>
    );
  }
}

class Comparisons extends Component {
  state = {
    comparisons: []
  };

  componentDidMount() {
    this.fetchComparisons();
  }

  fetchComparisons = () => _fetch('/comparisons/').then(data => this.setState({comparisons: data.data}));
  createComparison = () => _fetch('/comparisons/', {method: 'POST', body: {title: 'Test'}}).then(this.fetchComparisons);

  render() {
    const columns = [{
      Header: 'Name',
      accessor: 'title',
      Cell: ({value, original}) => <Link to={`/comparisons/${original.id}`}>{value}</Link>
    }, {
      Header: '',
      Cell: props => (
        <ButtonToolbar>
          <Button bsSize="xsmall" onClick={_.noop}>Edit</Button>
          <Button bsStyle="danger" bsSize="xsmall" onClick={_.noop}>Delete</Button>
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
        <Button
          className="margin-top pull-right"
          bsStyle="primary"
          onClick={this.createComparison}
        >Add Comparison</Button>
      </div>
    )
  }
}

class App extends Component {
  onAuth = _user => {
    user = _user;
    localStorage.setItem('user', JSON.stringify(user));
    window.location.href = '/comparisons/';
  };

  logout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  renderNavbar = () => (
    <Navbar>
      <Navbar.Header>
        <Navbar.Brand>
          <a href="#">Decisioneer</a>
        </Navbar.Brand>
        <Navbar.Toggle />
      </Navbar.Header>
      <Navbar.Collapse>
        <Navbar.Text>
          <Navbar.Link href="/comparisons/">Comparisons</Navbar.Link>
        </Navbar.Text>
        <Navbar.Text pullRight>
            <Navbar.Link href="#" onClick={this.logout}>Logout</Navbar.Link>
        </Navbar.Text>
      </Navbar.Collapse>
    </Navbar>
  );

  render() {
    if (!user) return <Auth onAuth={this.onAuth} />;

    return (
      <Router>
        <div>
          {this.renderNavbar()}
          <div className="container">
            <Route path="/comparisons/" exact component={Comparisons} />
            <Route path="/comparisons/:comparison_id" component={Comparison} />
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
