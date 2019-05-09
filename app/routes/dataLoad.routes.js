var express = require('express');
var router = express.Router();

var dataLoadController = require('./../controllers/dataLoad.controller');
var securityController = require('./../controllers/security.controller');


/**
 * POST /upload
 * Carga un archivo con información a ser procesada
 */
// router.post('/upload', securityController.validatePermission(Organization.permission, 'edit'), Organization.expressValidator(), organizationController.save);
router.post('/upload', dataLoadController.beforeUpload, dataLoadController.upload);
router.get('/download', dataLoadController.download);

router.get('/current', dataLoadController.current);
router.get('/current-info', dataLoadController.currentInfo);

router.post('/cancel-current', dataLoadController.cancelCurrent);
router.post('/confirm-current', dataLoadController.confirmCurrent);

module.exports = router;