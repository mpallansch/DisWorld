export default {
  Maps: {
    create: `CREATE TABLE IF NOT EXISTS Maps(
      channelId TEXT NOT NULL,
      messageId TEXT NOT NULL
    )`,
    insert: 'INSERT INTO Maps(channelId, messageId) VALUES(?, ?)',
    select: {
      all: 'SELECT * FROM Maps',
      byChannelId: 'SELECT * FROM Maps WHERE channelId = ?'
    },
    delete: 'DELETE FROM Maps WHERE channelId = ?'
  },
  Locations: {
    create: `CREATE TABLE IF NOT EXISTS Locations(
      channelId TEXT NOT NULL,
      userId TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL
    )`,
    insert: 'INSERT INTO Locations(channelId, userId, latitude, longitude) VALUES(?, ?, ?, ?)',
    select: {
      all: 'SELECT * FROM Locations',
      byChannelAndUser: 'SELECT * FROM Locations WHERE channelId = ? AND userId = ?'
    },
    update: 'UPDATE Locations SET latitude = ?, longitude = ? WHERE channelId = ? AND userId = ?',
    delete: {
      all: 'DELETE FROM Locations WHERE channelId = ?',
      one: 'DELETE FROM Locations WHERE channelId = ? AND userId = ?'
    }
  }
};