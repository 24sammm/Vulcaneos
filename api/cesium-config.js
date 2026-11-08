module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metode tidak diizinkan.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ionToken: process.env.CESIUM_ION_TOKEN || '' });
};
