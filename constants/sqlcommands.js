module.exports = {
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
      locationText TEXT NOT NULL
    )`,
    insert: 'INSERT INTO Locations(channelId, userId, locationText) VALUES(?, ?, ?)',
    select: {
      all: 'SELECT * FROM Locations',
      byChannelAndUser: 'SELECT * FROM Locations WHERE channelId = ? AND userId = ?'
    },
    update: 'UPDATE Locations SET locationText = ? WHERE channelId = ? AND userId = ?',
    delete: 'DELETE FROM Locations WHERE channelId = ?'
  }
};