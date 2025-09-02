import express from 'express';
const router = express.Router();

// In-memory storage for share data (in production, you'd use a database)
const shareData = new Map();

// Cleanup old shares (older than 1 hour)
const cleanupOldShares = () => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [shareId, data] of shareData.entries()) {
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
    }
  }
};

// Run cleanup every 15 minutes
setInterval(cleanupOldShares, 15 * 60 * 1000);

// Create a new mobile share
router.post('/create', (req, res) => {
  try {
    const { shareId, photoIndex, imageUrl, tezdevTheme, aspectRatio, outputFormat, timestamp } = req.body;
    
    if (!shareId || !imageUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store the share data
    shareData.set(shareId, {
      photoIndex,
      imageUrl,
      tezdevTheme,
      aspectRatio,
      outputFormat,
      timestamp
    });

    console.log(`Created mobile share: ${shareId}`);
    res.json({ success: true, shareId });
  } catch (error) {
    console.error('Error creating mobile share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get share data
router.get('/:shareId', (req, res) => {
  try {
    const { shareId } = req.params;
    const data = shareData.get(shareId);
    
    if (!data) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }

    // Check if share is expired (1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
      return res.status(404).json({ error: 'Share expired' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting share data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the mobile sharing page
router.get('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const data = shareData.get(shareId);
    
    if (!data) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Share Not Found - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 Share Not Found</h1>
            <p>This sharing link has expired or doesn't exist.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Check if share is expired
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Share Expired - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏰ Share Expired</h1>
            <p>This sharing link has expired. Sharing links are valid for 1 hour.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Generate the mobile sharing page
    const twitterText = encodeURIComponent("From my latest photoshoot in Sogni Photobooth! #MadeWithSogni #SogniPhotobooth ✨");
    const twitterUrl = `https://twitter.com/intent/tweet?text=${twitterText}&url=${encodeURIComponent(data.imageUrl)}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Share Your Photo - Sogni Photobooth</title>
        <meta property="og:title" content="My Sogni Photobooth Creation">
        <meta property="og:description" content="Check out my AI-generated photo from Sogni Photobooth!">
        <meta property="og:image" content="${data.imageUrl}">
        <meta property="og:type" content="website">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="My Sogni Photobooth Creation">
        <meta name="twitter:description" content="Check out my AI-generated photo from Sogni Photobooth!">
        <meta name="twitter:image" content="${data.imageUrl}">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            color: white;
          }
          
          .header {
            text-align: center;
            padding: 30px 20px 20px;
          }
          
          .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 700;
          }
          
          .header p {
            opacity: 0.9;
            font-size: 16px;
          }
          
          .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px;
          }
          
          .photo-container {
            background: white;
            border-radius: 20px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 100%;
          }
          
          .photo {
            width: 100%;
            height: auto;
            border-radius: 15px;
            display: block;
          }
          
          .actions {
            display: flex;
            flex-direction: column;
            gap: 15px;
            width: 100%;
            max-width: 400px;
          }
          
          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 16px 24px;
            border: none;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s ease;
            cursor: pointer;
          }
          
          .btn-twitter {
            background: #1DA1F2;
            color: white;
          }
          
          .btn-twitter:hover {
            background: #0d8bd9;
            transform: translateY(-2px);
          }
          
          .btn-download {
            background: white;
            color: #667eea;
            border: 2px solid rgba(255, 255, 255, 0.3);
          }
          
          .btn-download:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }
          
          .footer {
            text-align: center;
            padding: 20px;
            opacity: 0.8;
          }
          
          .footer a {
            color: white;
            text-decoration: none;
            font-weight: 500;
          }
          
          @media (max-width: 480px) {
            .header h1 {
              font-size: 24px;
            }
            
            .photo-container {
              margin: 0 10px 20px;
            }
            
            .actions {
              margin: 0 10px;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📸 Your Sogni Creation</h1>
          <p>Share your AI-generated masterpiece!</p>
        </div>
        
        <div class="content">
          <div class="photo-container">
            <img src="${data.imageUrl}" alt="Your Sogni Photobooth creation" class="photo" />
          </div>
          
          <div class="actions">
            <a href="${twitterUrl}" class="btn btn-twitter" target="_blank">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
              </svg>
              Share on Twitter
            </a>
            
            <a href="${data.imageUrl}" download="sogni-photobooth-creation.jpg" class="btn btn-download">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              Save to Phone
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>Created with <a href="https://photobooth.sogni.ai">Sogni Photobooth</a></p>
        </div>
        
        <script>
          // Auto-focus on Twitter button for better UX
          document.addEventListener('DOMContentLoaded', function() {
            const twitterBtn = document.querySelector('.btn-twitter');
            if (twitterBtn) {
              twitterBtn.focus();
            }
          });
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error serving mobile share page:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;
