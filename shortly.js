var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
//required session and cookieParser
var session = require('express-session');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(cookieParser('kent and ryan are awesome'));
app.use(session());

// restrict function prevents logged out clients to use the website
function restrict(req, res, next) {
  if (!req.session.user_id) {
    res.redirect('/login');
  } else {
    next();
  }
}

//creates main page
app.get('/',restrict, 
function(req, res) {
  res.render('index');
});

// recreates main page on creation
app.get('/create',restrict, 
function(req, res) {
  res.render('index');
});

// creates link list
app.get('/links',restrict, 
function(req, res) {
    Links.reset().fetch().then(function(links) {
      res.send(200, links.models);
    });
});

// handles submitting links to be shortened
// adds links to DB
app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your dedicated authentication routes here
// e.g. login, logout, etc.
/************************************************************/

// navigates to login page
app.get('/login', function (req, res) {
  res.render('login');
})

// sign in user, directs to home page
app.post('/login', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;

// check if username is in database
  db.knex('users').where({username: username})
    .then(function (results) {
      // get salt from results
      var hexValue = crypto.createHash('sha1').update(password + results[0].salt)
      password = hexValue.digest('hex');
        // add that to password
          // run pw through hash
            //compare with stored pw
      if(results.length > 0 && results[0].password === password){
      // then create a session
        req.session.regenerate(function(){
          req.session.user_id = username;
          res.redirect('/');
        });
      } else {
    // else redirect to login page
      res.redirect('/login');
      }    
  })
})

// navigates to signup page
app.get('/signup', function (req, res) {
  res.render('signup');
})

// adds new users to DB
app.post('/signup', function (req, res) {
  // fetch the username
  db.knex('users').where({username: req.body.username}).select('username')
    .then(function (results){
    // if username isn't taken
      // add user to collection
      var salt = crypto.randomBytes(16);
      var hexValue = crypto.createHash('sha1').update(req.body.password + salt)
      if (results.length === 0) {
        new User({
          'username': req.body.username,
          'salt': salt,
          'password': hexValue.digest('hex')
        }).save()
        .then(function(r){
          req.session.regenerate(function(){
            req.session.user_id = req.body.username;
            res.redirect('/');
          })
        })    
      } else {
    // if username is already taken
      // then don't create user
        //redirect to signup page again
        res.redirect('/signup');
      }
    })
})


// end session
app.get('/logout',restrict ,function (req, res) {
  // redirect to login page
  req.session.destroy(function(){
    res.redirect('/');
  });
})




/************************************************************/
// Handle the wildcard route last - if all other routes fail 
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
