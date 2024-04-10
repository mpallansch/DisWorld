const config = require('./constants/config.js');
const constants = require('./constants/constants.js');
const sqlCommands = require('./constants/sqlcommands.js');

const fs = require('fs');
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const client = new Discord.Client();

let clientConnected = false;
let dbConnected = false;

function initialize(){
  if(dbConnected && clientConnected) {
    //Create table if they don't already exist
    Object.keys(sqlCommands).forEach(tableName => {
      tablesInitialized++;
      db.run(sqlCommands[tableName].create, checkDatabaseInitFinished);
    });
  }
}

function checkDatabaseInitFinished(err) {
  if(err){
    console.log('Error creating table', err);
  }

  tablesInitialized--;
  if(tablesInitialized === 0) {
    initializeData();
  }
}

function initializeData() {

}

//Open the database
let db = new sqlite3.Database(config.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(err.message);
  }

  console.log('Connected to the danivent database.');

  dbConnected = true;
  initialize();
});
 
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);

  clientConnected = true;
  initialize();
});
 
client.on('message', msg => {
  
});
 
client.login(config.loginToken);