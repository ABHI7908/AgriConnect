(() => {
  const localHosts = ['localhost', '127.0.0.1', '[::1]'];
  if (location.protocol === 'file:') {
    location.replace('http://localhost:3000/');
    return;
  }
  if (localHosts.includes(location.hostname) && location.port !== '3000') {
    location.replace(`http://localhost:3000${location.pathname}${location.search}${location.hash}`);
  }
})();
