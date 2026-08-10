module.exports = {
  apps: [
    {
      name: "aaiq-realtime-os",
      script: "./dist/server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1200M",
      kill_timeout: 15000,
      listen_timeout: 15000,
      time: true,
      env_production: {
        NODE_ENV: "production",
        PORT: 4010,
      },
    },
  ],
};
