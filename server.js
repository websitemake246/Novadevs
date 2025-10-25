const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store data in memory (in production, use a database)
const accessRequests = new Map();
const approvedIPs = new Map();
const adminSockets = new Set();
const ADMIN_PASSWORD = "nova2024"; // Change this in production

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// API endpoint to check access
app.get('/api/check-access', (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (approvedIPs.has(clientIP)) {
        res.json({ approved: true });
    } else {
        // Create access request if not exists
        if (!accessRequests.has(clientIP)) {
            const requestId = uuidv4();
            const requestData = {
                id: requestId,
                ip: clientIP,
                timestamp: new Date(),
                userAgent: req.get('User-Agent'),
                status: 'pending'
            };
            
            accessRequests.set(clientIP, requestData);
            
            // Notify all admin sockets
            adminSockets.forEach(socket => {
                socket.emit('new-request', requestData);
            });
        }
        
        res.json({ approved: false });
    }
});

// API endpoint for admin actions
app.post('/api/admin/action', (req, res) => {
    const { action, ip, password } = req.body;
    
    // Verify admin password
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid admin password' });
    }
    
    if (action === 'approve') {
        approvedIPs.set(ip, { approvedAt: new Date() });
        accessRequests.delete(ip);
        
        // Notify all admin sockets
        adminSockets.forEach(socket => {
            socket.emit('request-approved', ip);
        });
        
        res.json({ success: true });
    } else if (action === 'decline') {
        accessRequests.delete(ip);
        
        // Notify all admin sockets
        adminSockets.forEach(socket => {
            socket.emit('request-declined', ip);
        });
        
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid action' });
    }
});

// API endpoint to get all pending requests
app.get('/api/admin/requests', (req, res) => {
    const requests = Array.from(accessRequests.values());
    res.json(requests);
});

// Socket.io for real-time notifications
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Check if it's an admin socket
    socket.on('admin-join', (password) => {
        if (password === ADMIN_PASSWORD) {
            adminSockets.add(socket);
            console.log('Admin joined');
            
            // Send current pending requests
            const requests = Array.from(accessRequests.values());
            socket.emit('initial-requests', requests);
        }
    });
    
    socket.on('disconnect', () => {
        adminSockets.delete(socket);
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Website: http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
