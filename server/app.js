const express = require('express'),
  cors = require('cors'),
  nconf = require('nconf'),
  Sequelize = require('sequelize'),
  passportLocalSequelize = require('passport-local-sequelize'),
  passport = require('passport'),
  bodyParser = require('body-parser'),
  methodOverride = require('method-override'),
  _ = require('lodash'),
  jwt = require('jsonwebtoken'),
  crypto = require('crypto');

nconf.argv().env().file({ file: 'config.json' });

// ------- Database -------
global.sequelize = new Sequelize(nconf.get('DATABASE_URL'), {
  define:{
    underscored: true,
    freezeTableName:true
  }
});


// User
let defaultUserSchema = passportLocalSequelize.defaultUserSchema;
delete defaultUserSchema.username;
let User = sequelize.define('users', _.defaults({
  email: {type: Sequelize.STRING, validate: {isEmail:true}, unique: true, allowNull: false},
  role: {type: Sequelize.ENUM('user', 'admin'), defaultValue: 'user'}
}, defaultUserSchema), {
  classMethods: {}
});
passportLocalSequelize.attachToUser(User, {
  usernameField: 'email',
  usernameLowerCase: true,
  // activationRequired: true
});

// Feature
let Feature = sequelize.define('features', {
  title: Sequelize.STRING,
  description: Sequelize.TEXT,
  weight: Sequelize.INTEGER
});

// Candidate
let Candidate = sequelize.define('candidates', {
  name: Sequelize.STRING,
  notes: Sequelize.TEXT,
  links: Sequelize.ARRAY(Sequelize.STRING)
});

// Score
let Score = sequelize.define('scores', {
  user_id: {type: Sequelize.INTEGER, primaryKey: true, onDelete: 'CASCADE'},
  candidate_id: {type: Sequelize.INTEGER, primaryKey: true, onDelete: 'CASCADE'},
  feature_id: {type: Sequelize.INTEGER, primaryKey: true, onDelete: 'CASCADE'},
  score: Sequelize.INTEGER
}, {
  // indexes: [
  //   {
  //     fields: ["user_id", "candidate_id", "feature_id"],
  //     primary: true,
  //   }
  // ]
});

Score.belongsTo(User);
Score.belongsTo(Candidate);
Score.belongsTo(Feature);

// ------- Express -------

const app = express();
app.use(cors())
  .use(bodyParser.json())
  .use(bodyParser.urlencoded({ extended: false }))
  .use(methodOverride());

app.use(passport.initialize());
passport.use(User.createStrategy());

const localOpts = {session:false, failWithError:true};

app.post('/register', (req, res, next) => {
  User.register(req.body, req.body.password, (err, user) => {
    if (err) return next(err);
    passport.authenticate('local', localOpts)(req, res, () => {
      res.json({token: sign(user), uid: user.id, role: user.role});
    });
  });
});

app.post('/login', passport.authenticate('local', localOpts), function(req, res){
  res.json({
    token: sign(req.user),
    uid: req.user.id,
    role: req.user.role
  });
});


// Features
app.get('/features', ensureAuth, (req, res, next) => {
  Feature.findAll().then(f => res.json(f));
});
app.get('/features/:id', ensureAuth, (req, res, next) => {
  Feature.findById(req.params.id).then(f => res.json(f));
});
app.post('/features', ensureAuth, ensureAdmin, (req, res, next) => {
  Feature.create(req.body).then(f => res.json(f));
});
app.put('/features/:id', ensureAuth, ensureAdmin, (req, res, next) => {
  Feature.update(req.body, {where: {id: req.params.id}, returning: true}).then(f => res.json(f[1][0]));
});
app.delete('/features/:id', ensureAuth, ensureAdmin, (req, res, next) => {
  Feature.destroy({where: {id: req.params.id}}).then(() => res.json({ok: true}));
});


// Candidates
app.get('/candidates', ensureAuth, (req, res, next) => {
  //FIXME do this all in SQL, save billions of CPU
  Promise.all([
    Candidate.findAll({raw: true}),
    Feature.findAll({raw: true}),
    sequelize.query(`select "candidate_id", "feature_id", avg(score) from scores group by "candidate_id", "feature_id"`, { type: sequelize.QueryTypes.SELECT})
  ]).then(arr => {
    let candidates = arr[0], features = arr[1], scores = arr[2];
    console.log({candidates, features, scores});
    candidates.forEach(c => {
      c.score = 0;
      features.forEach(f => {
        let s = _.find(scores, {candidate_id: c.id, feature_id: f.id});
        if (!s) return;
        c.score += +s.avg * f.weight;
      });
    });
    res.json(_.sortBy(candidates, 'score').reverse());
  });
});
// TODO make sure ensureAuth v ensureAdmin is used properly in the following candidate-routes
app.get('/candidates/:id', ensureAuth, (req, res, next) => {
  Candidate.findById(req.params.id).then(c => res.json(c));
});
app.post('/candidates', ensureAuth, (req, res, next) => {
  Candidate.create(req.body).then(f => res.json(f));
});
app.put('/candidates/:id', ensureAuth, ensureAdmin, (req, res, next) => {
  Candidate.update(req.body, {where: {id: req.params.id}, returning: true}).then(c => res.json(c[1][0]));
});
app.delete('/candidates/:id', ensureAuth, ensureAdmin, (req, res, next) => {
  Candidate.destroy({where: {id: req.params.id}}).then(() => res.json({ok: true}));
});

// Scores
app.post('/score/:candidate/:feature/:score', ensureAuth, (req, res, next) => {
  let where = {
    user_id: req.user.id,
    candidate_id: req.params.candidate,
    feature_id: req.params.feature
  };
  Score.findOrCreate({where, defaults: where}).then(s => {
    s = s[0];
    s.score = +req.params.score;
    s.save().then(s => res.json(s));
  });
});

function sign (user) {
  var u = _.pick(user, ['id', 'email']);
  return jwt.sign(u, nconf.get('SECRET'), {
    expiresIn: '30d'
  });
}

function ensureAuth (req, res, next) {
  // check header or url parameters or post parameters for token
  var token = req.headers['x-access-token'];
  if (!token) {
    return next({status: 403, message: 'No token provided.'});
  }
  // decode token
  jwt.verify(token, nconf.get('SECRET'), (err, decoded) => {
    if (err)
      return next({status:403, message:'Failed to authenticate token.'});
    // if √ save to req for use in other routes. We don't do req.user=decoded, since that contains stale data
    User.findById(decoded.id).then(user => {
      req.user = user;
      next();
    });
  });
}

function ensureAdmin (req, res, next) {
  if (req.user.role !== 'admin')
    return next({status: 403, message: "Insufficient user privilege"});
  next();
}

// error handler
app.use(function(err, req, res, next) {
  console.log(err);
  if (err.name == 'AuthenticationError') // Passport just gives us "Unauthorized", not sure how to get specifics
    err = {status:401, message:"Login failed, please check email address or password and try again."};
  res.status(err.status || 500)
    .json({message: err.message || err});
});

module.exports = Promise.all([
  sequelize.sync(),
  new Promise((y,n) => app.listen(3001, () => y(console.log('Port 3001'))))
]);
