const { google } = require('googleapis');
const { query } = require('../database/db');
const logger = require('./logger.service');

class CalendarService {
  async getOAuth2Client() {
    const admins = await query('SELECT * FROM admins WHERE google_token IS NOT NULL LIMIT 1');
    if (!admins || admins.length === 0) {
      throw new Error('No Google authentication found');
    }
    
    const admin = admins[0];
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({
      access_token: admin.google_token,
      refresh_token: admin.google_refresh,
    });
    
    return oauth2Client;
  }

  async updateEvent(eventId, eventData) {
    try {
      const auth = await this.getOAuth2Client();
      const calendar = google.calendar({ version: 'v3', auth });

      const event = {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.start,
          timeZone: 'Asia/Karachi',
        },
        end: {
          dateTime: eventData.end,
          timeZone: 'Asia/Karachi',
        },
      };

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event,
      });

      logger.success('CALENDAR_UPDATE', `Event ${eventId} updated successfully`);
      return response.data;
    } catch (error) {
      logger.error('CALENDAR_UPDATE', 'Failed to update calendar event', { 
        eventId, 
        error: error.message 
      });
      throw error;
    }
  }

  async deleteEvent(eventId) {
    try {
      const auth = await this.getOAuth2Client();
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      logger.success('CALENDAR_DELETE', `Event ${eventId} deleted successfully`);
    } catch (error) {
      logger.error('CALENDAR_DELETE', 'Failed to delete calendar event', { 
        eventId, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = new CalendarService();
