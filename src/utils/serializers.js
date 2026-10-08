'use strict';

const storage = require('../services/storage');

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    phone: u.phone || null,
    email: u.email || null,
    name: u.name || null,
    businessName: u.business_name || null,
    village: u.village || null,
    district: u.district || null,
    state: u.state || null,
    address: u.address || null,
    lat: u.lat ?? null,
    lng: u.lng ?? null,
    profileComplete: !!u.profile_complete,
    createdAt: u.created_at,
  };
}

function imageDto(img) {
  return { id: img.id, url: storage.urlFor(img.filename), position: img.position };
}

const round = (n, d = 1) => (n === null || n === undefined ? null : Number(n.toFixed(d)));

module.exports = { publicUser, imageDto, round };
