import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import Canvas from '@napi-rs/canvas';
import sqlite3 from 'sqlite3';

import config from './constants/config.js';
import constants from './constants/constants.js';
import sqlCommands from './constants/sqlcommands.js';
import topoJSON from './geo/world-topo.json' assert { type: 'json' };

const client = new Client({ intents: [
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
] });

const worldMapFeatures = feature(topoJSON, topoJSON.objects.countries).features;

let tablesInitialized = 0;
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

const renderMap = async (locations) => {
  const canvas = Canvas.createCanvas(850, 550);
  const context = canvas.getContext('2d');
  const projection = geoMercator();
  projection.scale(canvas.width / 6.25).translate([canvas.width / 2, canvas.height * .65])
  const path = geoPath(projection, context);

  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = 'grey';
  context.strokeStyle = 'black';
  worldMapFeatures.forEach(geo => {
    context.beginPath()
    path(geo)
    context.fill()
    context.stroke()
  })

  if(locations){
    Object.keys(locations).forEach((username, i) => {
      const coords = projection([locations[username][1], locations[username][0]]);
      context.fillStyle = 'red';
      context.fillRect(coords[0] - constants.halfPinSize, coords[1] - constants.halfPinSize, constants.pinSize, constants.pinSize);
    });
  }

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
    msg.delete();

    db.all(sqlCommands.Maps.select.byChannelId, [msg.channel.id], async (err, rows) => {
      if(err) {
        return console.log('Error loading maps from database', err);
      }
  
      if(rows.length === 0){
        msg.channel.send({ files: [await renderMap()] }).then((mapMessage => {
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
    msg.delete();

    const response = await fetch(`${config.radarApiRoot}?query=${encodeURIComponent(msg.content)}&layers=address`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.radarApiAuthorization
      }
    });

    const jsonData = await response.json();

    if(jsonData && jsonData.addresses && jsonData.addresses.length > 0) {
      const latitude = jsonData.addresses[0].latitude;
      const longitude = jsonData.addresses[0].longitude;

      db.all(sqlCommands.Locations.select.byChannelAndUser, [msg.channel.id, msg.author.username], async (err, rows) => {
        if(err){
          return console.log('Error checking if location is duplicate')
        }
  
        db.run(
          rows.length === 0 ? sqlCommands.Locations.insert : sqlCommands.Locations.update, 
          rows.length === 0 ? [msg.channel.id, msg.author.username, latitude, longitude] : [latitude, longitude, msg.channel.id, msg.author.username],
          async (err) => {
            if(err){
              return console.log('Error adding location to database', err);
            }
      
            mapChannelIds[msg.channel.id].locations[msg.author.username] = [latitude, longitude];
      
            msg.channel.messages.fetch(mapChannelIds[msg.channel.id].message).then(async (msg) => {
              msg.edit({ files: [await renderMap(mapChannelIds[msg.channel.id].locations)] }).catch((err) => {
                console.log('Error editing message', err);
              })
            }).catch((err) => {
              console.log('Error finding message', err);
            });
        });
      });
    }
  }
});
 
client.login(config.loginToken);