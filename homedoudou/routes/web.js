const express = require('express');

function createWebRouter(state) {
    const router = express.Router();

    router.get('/', (req, res) => {
        const status = state.getStatus();
        res.render('index', {
            title: 'HomeDoudou',
            version: '2.0.0',
            status
        });
    });

    return router;
}

module.exports = createWebRouter;
