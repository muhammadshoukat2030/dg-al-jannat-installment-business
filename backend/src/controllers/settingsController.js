const BusinessSetting = require('../models/BusinessSetting');
const asyncHandler = require('../middleware/asyncHandler');

const getSettings = asyncHandler(async (req, res) => {
  let settings = await BusinessSetting.findOne();
  if (!settings) settings = await BusinessSetting.create({});
  res.json({ success: true, data: settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  let settings = await BusinessSetting.findOne();
  if (!settings) settings = new BusinessSetting();
  const { _id, createdAt, updatedAt, __v, ...updatable } = req.body;
  Object.assign(settings, updatable);
  await settings.save();
  res.json({ success: true, data: settings });
});

module.exports = { getSettings, updateSettings };
