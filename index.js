const config = require('./constants/config.js');
const constants = require('./constants/constants.js');
const sqlCommands = require('./constants/sqlcommands.js');

const fs = require('fs');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const Canvas = require('@napi-rs/canvas');
const sqlite3 = require('sqlite3').verbose();
const client = new Client({ intents: [
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
] });

let clientConnected = false;
let dbConnected = false;
let mapChannelIds = {};

const initialize = () => {
  if(dbConnected && clientConnected) {
    //Create table if they don't already exist
    Object.keys(sqlCommands).forEach(tableName => {
      tablesInitialized++;
      db.run(sqlCommands[tableName].create, checkDatabaseInitFinished);
    });
  }
}

const checkDatabaseInitFinished = (err) => {
  if(err){
    console.log('Error creating table', err);
  }

  tablesInitialized--;
  if(tablesInitialized === 0) {
    initializeData();
  }
}

const initializeData = () => {
  db.all(sqlCommands.Maps.select.all, (err, rows) => {
    if(err){
      return console.log('Error pulling maps info')
    }

    rows.forEach(row => {
      mapChannelIds[row.channelId] = {
        message: row.messageId,
        locations: {}
      };
    });

    db.all(sqlCommands.Locations.select.all, (err, rows) => {
      if(err){
        return console.log('Error pulling locations info')
      }
  
      rows.forEach(row => {
        if(mapChannelIds[row.channelId]){
          mapChannelIds[row.channelId].locations[row.userId] = row.locationText;
        } else {
          //TODO delete eronious location without a valid corresponding map
        }
      });
    })
  })
}

//Open the database
const db = new sqlite3.Database(config.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(err.message);
  }

  console.log('Connected to the disworld database.');

  dbConnected = true;
  initialize();
});

const renderMap = async () => {
  const canvas = Canvas.createCanvas(700, 250);
  const context = canvas.getContext('2d');

  context.fillStyle = 'white';
  context.fillRect(0, 0, 700, 250);
  context.fillStyle = 'black';
  context.fillText('Here', 10, 10);

  const encodedImage = await canvas.encode('png');

  const attachment = new AttachmentBuilder(encodedImage, { name: 'world-map.png' });

  return attachment;
}
 
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);

  clientConnected = true;
  initialize();
});
 
client.on('messageCreate', async (msg) => {
  if (msg.content.search(/!disworld($| )/) === 0) {
    //Delete the users message from the channel
    msg.delete();

    db.all(sqlCommands.Maps.select.byChannelId, [msg.channel.id] (err, rows) => {
      if(err) {
        return console.log('Error loading maps from database', err);
      }
  
      if(rows.length === 0){
        msg.channel.send({ files: [renderMap()] }).then((mapMessage => {
          db.run(sqlCommands.Maps.insert, [msg.channel.id, mapMessage.id], (err) => {
            if(err){
              return console.log('Error adding map to database', err);
            }

            mapChannelIds[msg.channel.id] = {
              message: mapMessage.id,
              locations: {}
            }
          });
        }));
      }
    });
  } else if(mapChannelIds[msg.channel.id]) {
    console.log(msg.user.id);
    //TODO check if no locations already exist for user 
    db.run(sqlCommands.Locations.insert, [msg.channel.id, msg.user.id, msg.content], (err) => {
      if(err){
        return console.log('Error adding location to database', err);
      }

      mapChannelIds[msg.channel.id].locations[msg.user.id] = msg.content;

      channel.messages.fetch(mapChannelIds[msg.channel.id].message).then((msg) => {
        //TODO update message with renderMap()
      }).catch(() => {
        //TODO handle this fail
      });
    });
  }
});
 
client.login(config.loginToken);