import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { Client, GatewayIntentBits, AttachmentBuilder, Collection, Events } from 'discord.js';
import Canvas from '@napi-rs/canvas';
import sqlite3 from 'sqlite3';

import config from './constants/config.js';
import constants from './constants/constants.js';
import sqlCommands from './constants/sqlcommands.js';
import topoJSON from './geo/world-topo.json' assert { type: 'json' };

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pinImgData = fs.readFileSync('./assets/pin.png');
const pinImg = new Canvas.Image();
pinImg.src = pinImgData;

const client = new Client({ intents: [
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
] });

const commands = [];
client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  if(folder !== '.DS_Store'){
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = (await import(filePath)).default;
      if ('data' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" property.`);
      }
    }
  }
}

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

  context.fillStyle = 'lightblue';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = 'lightgray';
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
      context.drawImage(pinImg, coords[0] - constants.halfPinWidth, coords[1] - constants.pinHeight, constants.pinWidth, constants.pinHeight);
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

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await commandExecutes[interaction.commandName](interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

client.on(Events.GuildCreate, async (guild) => {
  guild.commands.set(commands).then(() => 
    console.log(`Commands deployed in guild ${guild.name}!`)
  );
});

const addLocation = (interaction, latitude, longitude) => {
  db.all(sqlCommands.Locations.select.byChannelAndUser, [interaction.channelId, interaction.user.id], async (err, rows) => {
    if(err){
      interaction.reply({ content: 'Error checking if location is duplicate', ephemeral: true });
      return console.log('Error checking if location is duplicate')
    }

    db.run(
      rows.length === 0 ? sqlCommands.Locations.insert : sqlCommands.Locations.update, 
      rows.length === 0 ? [interaction.channelId, interaction.user.id, latitude, longitude] : [latitude, longitude, interaction.channelId, interaction.user.id],
      async (err) => {
        if(err){
          interaction.reply({ content: 'Error adding location to database', ephemeral: true });
          return console.log('Error adding location to database', err);
        }
  
        mapChannelIds[interaction.channelId].locations[interaction.user.id] = [latitude, longitude];
  
        client.channels.fetch(interaction.channelId)
          .then(async channel => {
            channel.messages.fetch(mapChannelIds[interaction.channelId].message).then(async (mapMessage) => {
              mapMessage.edit({ files: [await renderMap(mapChannelIds[interaction.channelId].locations)] }).then(() => {
                interaction.reply({ content: 'Location set successfully', ephemeral: true });
              }).catch((err) => {
                interaction.reply({ content: 'Error editing message with map', ephemeral: true });
                console.log('Error editing message', err);
              })
            }).catch((err) => {
              interaction.reply({ content: 'Error finding message with map', ephemeral: true });
              console.log('Error finding message', err);
            });
          })
          .catch(err => {
            interaction.reply({ content: 'Error fetching channel with map', ephemeral: true });
            console.log('Error fetching channel', err);
          });
    });
  });
};

const commandExecutes = {
  'create-map': async (interaction) => {
    db.all(sqlCommands.Maps.select.byChannelId, [interaction.channelId], async (err, rows) => {
      if(err) {
        interaction.reply({ content: 'Error loading maps to database', ephemeral: true });
        return console.log('Error loading maps from database', err);
      }
  
      if(rows.length === 0){
        client.channels.fetch(interaction.channelId)
          .then(async channel => {
            channel.send({ files: [await renderMap()] }).then((mapMessage => {
              db.run(sqlCommands.Maps.insert, [interaction.channelId, mapMessage.id], (err) => {
                if(err){
                  interaction.reply({ content: 'Error adding map to database', ephemeral: true });
                  return console.log('Error adding map to database', err);
                }
    
                mapChannelIds[interaction.channelId] = {
                  message: mapMessage.id,
                  locations: {}
                }

                interaction.reply({ content: 'DisWorld map created in channel', ephemeral: true });
              });
            }))
            .catch(err => {
              interaction.reply({ content: 'Error adding map to channel', ephemeral: true });
              console.log('Error adding map message to channel', err);
            })
          })
          .catch(err => {
            interaction.reply({ content: 'Error accessing channel to create map in', ephemeral: true });
            console.log('Error fetching channel', err);
          });
      } else {
        interaction.reply({ content: 'There is already a DisWorld map created in channel', ephemeral: true });
      }
    });
  },
  'set-location-address': async (interaction) => {
    const response = await fetch(`${config.radarApiRoot}?query=${encodeURIComponent(interaction.options.getString('address'))}&layers=address${interaction.options.getString('country') ? '&country=' + interaction.options.getString('country') : ''}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.radarApiAuthorization
      }
    });

    const jsonData = await response.json();

    if(jsonData && jsonData.addresses && jsonData.addresses.length > 0) {
      const latitude = jsonData.addresses[0].latitude;
      const longitude = jsonData.addresses[0].longitude;

      addLocation(interaction, latitude, longitude);
      return;
    }

    interaction.reply({ content: 'Error converting address to lat/long', ephemeral: true });
  },
  'set-location-coords': async (interaction) => {
    addLocation(interaction, interaction.options.getNumber('latitude'), interaction.options.getNumber('longitude'));
  },
  'clear-location': async (interaction) => {
    db.run(sqlCommands.Locations.delete.one, [interaction.channelId, interaction.user.id], (err) => {
      if(err){
        console.log('Error deleting location from database', err)
      }
    })
    if(mapChannelIds[interaction.channelId] && mapChannelIds[interaction.channelId].locations && mapChannelIds[interaction.channelId].locations[interaction.user.id]){
      delete mapChannelIds[interaction.channelId].locations[interaction.user.id];

      client.channels.fetch(interaction.channelId)
        .then(async channel => {
          channel.messages.fetch(mapChannelIds[interaction.channelId].message).then(async (mapMessage) => {
            mapMessage.edit({ files: [await renderMap(mapChannelIds[interaction.channelId].locations)] }).then(() => {
              interaction.reply({ content: 'Your location has been cleared successfully', ephemeral: true });
            }).catch((err) => {
              interaction.reply({ content: 'Error editing message with map', ephemeral: true });
              console.log('Error editing message', err);
            })
          }).catch((err) => {
            interaction.reply({ content: 'Error finding message with map', ephemeral: true });
            console.log('Error finding message', err);
          });
        })
        .catch(err => {
          interaction.reply({ content: 'Error fetching channel with map', ephemeral: true });
          console.log('Error fetching channel', err);
        });
    } else {
      interaction.reply({ content: 'No location set for current user', ephemeral: true });
    }
  },
  'remove-map': async (interaction) => {
    db.all(sqlCommands.Maps.select.byChannelId, [interaction.channelId], async (err, rows) => {
      if(err) {
        interaction.reply({ content: 'Error loading map from database', ephemeral: true });
        return console.log('Error loading map from database', err);
      }
  
      if(rows.length > 0){
        client.channels.fetch(interaction.channelId)
        .then(async channel => {
          channel.messages.fetch(rows[0].messageId).then(async (mapMessage) => {
            mapMessage.delete().then(() => {
              interaction.reply({ content: 'DisWorld map deleted from this channel successfully', ephemeral: true });
            }).catch(() => {
              interaction.reply({ content: 'Error deleting message with map in this channel', ephemeral: true });
            });
          }).catch((err) => {
            interaction.reply({ content: 'Error finding message with map in this channel', ephemeral: true });
            console.log('Error finding message', err);
          });
        })
        .catch(err => {
          interaction.reply({ content: 'Error fetching channel with map', ephemeral: true });
          console.log('Error fetching channel', err);
        });

        delete mapChannelIds[interaction.channelId];
        db.run(sqlCommands.Maps.delete, [interaction.channelId], (err) => {
          if(err){
            return console.log('Error deleting map from database', err);
          }
        });
        db.run(sqlCommands.Locations.delete.all, [interaction.channelId], (err) => {
          if(err){
            return console.log('Error deleting locations from database', err);
          }
        });
      } else {
        interaction.reply({ content: 'No DisWorld map has been created in the current channel', ephemeral: true });
      }
    });
  }
}
 
client.login(config.loginToken);