export function createApp(): { listen: (port: number) => void } {
  return {
    listen(_port: number) {
      // The HTTP server starts here.
    },
  };
}

createApp().listen(3000);
