require('dotenv').config();
const Sequelize = require('sequelize');
const epilogue = require('epilogue'), ForbiddenError = epilogue.Errors.ForbiddenError;
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
//Creats a new session
const session = require('express-session');
//Redirecting the user to Okta for authentication and handling the callback from Okta. Once this flow is complete, a local session is created and the user context is saved for the duration of the session.
const { ExpressOIDC } = require('@okta/oidc-middleware');
const app = express();
const port = 3000;

// session support is required to use ExpressOIDC
app.use(session({
    secret: process.env.RANDOM_SECRET_WORD,
    resave: true,
    saveUninitialized: false
}));

//Create an instance of ExpressOIDC
const oidc = new ExpressOIDC({
    issuer: `${process.env.OKTA_ORG_URL}/oauth2/default`,
    client_id: process.env.OKTA_CLIENT_ID,
    client_secret: process.env.OKTA_CLIENT_SECRET,
    redirect_uri: process.env.REDIRECT_URL,
    scope: 'openid profile',
    routes: {
        callback: {
            path: '/authorization-code/callback',
            // redirect User the admin page.
            defaultRedirect: '/admin'
        }
    }
});


//---------ExpressOIDC will attach handlers for the /login and /authorization-code/callback routes
app.use(oidc.router);



app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

//Page routes
app.get('/home', (req, res) => {
   res.sendFile(path.join(__dirname, './public/home.html'));
});

//.ensureauthenticated ensures that you are logged in before seeing the page
app.get('/admin', oidc.ensureAuthenticated(), (req, res) => {
   res.sendFile(path.join(__dirname, './public/admin.html'));
});


app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/home');
});

//Redirects after login
app.get('/', (req, res) => {
  res.redirect('/home');
});

/*
Page routes example
app.get('/food', (req, res) => {
    res.send('<h1>Welcome!!</div><a href="/login">Login</a>');
   });
*/

//--------CRUD Operations using epilogue and sequelize

//Set up new SQLite database connection
const database = new Sequelize({
    dialect: 'sqlite',
    storage: './db.sqlite',
    operatorsAliases: false,
});

//Defines the model in the database
const Post = database.define('posts', {//Posts model
    title: Sequelize.STRING,
    content: Sequelize.TEXT,
});

//Initializes Epiologue with express.js app and database
epilogue.initialize({ app, sequelize: database });

//Creates CRUD resources
const PostResource = epilogue.resource({
    model: Post,
    endpoints: ['/posts', '/posts/:id'],
});

//Authentication for all CRUD operations
PostResource.all.auth(function (req, res, context) {
    return new Promise(function (resolve, reject) {
        if (!req.isAuthenticated()) {
            res.status(401).send({ message: "Unauthorized" });
            resolve(context.stop);
        } else {
            resolve(context.continue);
        }
    })
});

database.sync().then(() => {
    oidc.on('ready', () => {
        app.listen(port, () => console.log(`My Blog App listening on port ${port}!`))
    });
});

oidc.on('error', err => {
    // An error occurred while setting up OIDC
    console.log("oidc error: ", err);
});