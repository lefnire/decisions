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

// Comparison
let Comparison = sequelize.define('comparison', {
  title: Sequelize.STRING,
});

// Feature
let Feature = sequelize.define('features', {
  title: Sequelize.STRING,
  description: Sequelize.TEXT,
  weight: {type: Sequelize.INTEGER, min: 0, max: 5}
});

// Candidate
let Candidate = sequelize.define('candidates', {
  name: Sequelize.STRING,
  notes: Sequelize.TEXT,
  links: Sequelize.ARRAY(Sequelize.STRING)
});

Feature.belongsTo(Comparison);
Candidate.belongsTo(Comparison);
Comparison.hasMany(Feature);
Comparison.hasMany(Candidate);

// Score
let Score = sequelize.define('scores', {
  user_id: {type: Sequelize.INTEGER, primaryKey: true, onDelete: 'CASCADE'},
  candidate_id: {type: Sequelize.INTEGER, primaryKey: true, onDelete: 'CASCADE'},
  feature_id: {type: Sequelize.INTEGER, primaryKey: true, onDelete: 'CASCADE'},
  score: {type: Sequelize.INTEGER, allowNull: false, min: 0, max: 5}
}, {
  // indexes: [
  //   {
  //     fields: ["user_id", "candidate_id", "feature_id"],
  //     primary: true,
  //   }
  // ]
});

Score.belongsTo(User);
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

// Comparison
app.get('/:id', ensureAuth, (req, res, next) => {
  Promise.all([
    Comparison.findById(req.params.id, {include: [Feature]}),
    sequelize.query(`
      SELECT c.*,
        ARRAY_AGG('{"feature_id":' || s.feature_id || ', "score_id":' || s.score || '}') as features,
        SUM(s.score) as score
      FROM candidates c
      LEFT JOIN (
        SELECT _s.feature_id, _s.candidate_id, AVG(_s.score) * (SELECT weight FROM features WHERE _s.feature_id=features.id) score
        FROM scores _s
        GROUP BY _s.feature_id, _s.candidate_id
      ) s ON s.candidate_id=c.id
      GROUP BY c.id
      ORDER BY score DESC
    `, {type: sequelize.QueryTypes.SELECT})
  ]).then(arr => {
      arr[1].forEach(c => {
          c.features = c.features.map(f => JSON.parse(f));
      });
      res.json(_.sortBy(arr[1], 'score').reverse());
  });
});


app.get('/features/:id', ensureAuth, (req, res, next) => {
  Feature.findById(req.params.id).then(f => res.json(f));
});
app.post('/:doc/features', ensureAuth, ensureAdmin, (req, res, next) => {
  Feature.create(req.body).then(f => res.json(f));
});
app.put('/features/:id', ensureAuth, ensureAdmin, (req, res, next) => {
  Feature.update(req.body, {where: {id: req.params.id}, returning: true}).then(f => res.json(f[1][0]));
});
app.delete('/features/:id', ensureAuth, ensureAdmin, (req, res, next) => {
  Feature.destroy({where: {id: req.params.id}}).then(() => res.json({ok: true}));
});


// Candidates
// TODO make sure ensureAuth v ensureAdmin is used properly in the following candidate-routes
app.get('/candidates/:id', ensureAuth, (req, res, next) => {
  // http://stackoverflow.com/questions/34163209/postgres-aggregate-two-columns-into-one-item
  sequelize.query(`
    SELECT c.*, array_agg('[' || s.feature_id || ',' || s.score || ']') as features
    FROM candidates c
    LEFT JOIN scores s ON s.user_id=:user AND s.candidate_id=c.id
    WHERE c.id=:candidate
    GROUP BY c.id
    LIMIT 1
    `, {replacements: {user: +req.user.id, candidate: +req.params.id}, type: sequelize.QueryTypes.SELECT}
  ).then(arr => {
    let candidate = arr[0];
    candidate.features = _.transform(candidate.features, (m,v) => {
      let f = JSON.parse(v);
      if (f) m[f[0]] = f[1];
      return m;
    }, {});
    res.json(candidate);
  });
  // Candidate.findById(req.params.id).then(c => res.json(c));
});
app.post('/:doc/candidates', ensureAuth, (req, res, next) => {
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
  let obj = {
    user_id: req.user.id,
    candidate_id: req.params.candidate,
    feature_id: req.params.feature,
    score: +req.params.score
  };
  Score.upsert(obj).then(r => res.json({ok: true}));
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
  new Promise((y,n) => app.listen(nconf.get("PORT"), () => y(console.log('Port 3001'))))
]);
