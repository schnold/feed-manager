// Scheduled Netlify Function for periodic tasks
// This can be triggered by Netlify's scheduled functions or external cron services

export const handler = async (event, context) => {
  try {
    // Import the feed generation service
    const { generateAllFeeds } = await import('../../app/services/feeds/generate-google-xml.server.js');
    
    console.log('Starting scheduled feed generation...');
    
    // Generate all active feeds
    await generateAllFeeds();
    
    console.log('Scheduled feed generation completed successfully');
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Scheduled task completed successfully',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Scheduled task failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Scheduled task failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
