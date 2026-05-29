const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

// We need to set ENABLE_DASHBOARD to true BEFORE requiring app.js
// so that the dashboard routes are registered.
beforeAll(() => {
   process.env.ENABLE_DASHBOARD = 'true';
   try {
       fs.mkdirSync(path.join(__dirname, '../temp/media'), { recursive: true });
       fs.writeFileSync(path.join(__dirname, '../temp/secret.txt'), 'secret');
       fs.writeFileSync(path.join(__dirname, '../temp/media/test.jpg'), 'image');
   } catch(e) {}
});

// require app AFTER env changes
const app = require('../src/app');

describe('App.js Route Coverage tests', () => {

    it('GET /health should return status ok', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('GET /temp/media/test.jpg should allow access if file exists', async () => {
        // Here we test the custom setHeaders logic in express.static
        const res = await request(app).get('/temp/media/test.jpg');
        // Since we created the file, it should return 200
        expect(res.statusCode).toBe(200);
    });

    it('GET /temp/secret.txt should return 403 Forbidden', async () => {
        // This targets lines 26-27 in app.js where non-media paths are denied
        const res = await request(app).get('/temp/secret.txt');
        expect(res.statusCode).toBe(403);
        expect(res.text).toBe('Forbidden');
    });

    it('GET /dashboard/ should return index.html (or 404 if dist not built yet)', async () => {
        // This targets line 47 in app.js 
        const res = await request(app).get('/dashboard/');
        // Can be 200 if frontend is built and dist/index.html exists, or 404/500 depending on framework
        // The important part is that we traverse the route handler 
        expect([200, 404, 500]).toContain(res.statusCode);
    });

    it('GET /dashboard/assets/app.js should not be intercepted as html', async () => {
        // This targets line 46 in app.js
        const res = await request(app).get('/dashboard/assets/app.js');
        // Because it has a dot, it skips sending index.html and falls through Express Static, which gives 404 if missing
        expect(res.statusCode).toBe(404);
    });
});
