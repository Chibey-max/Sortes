/** The 144 rendered frames of the kleroterion, in order (public/story/f001.webp … f144.webp). */
export const FRAME_COUNT = 144;
export const frameUrl = (n: number) => `/story/f${String(Math.max(1, Math.min(FRAME_COUNT, Math.round(n)))).padStart(3, "0")}.webp`;

/** Stills the design uses outside the scroll story (frame numbers). */
export const STILL = {
  hero: 1,         // the whole machine
  houseTicket: 37, // bronze ticket into the top row
  whiteBall: 57,   // white ball in the air
  funnel: 61,      // white ball, the funnel
  seated: 65,      // your secret matches its commit
  blackBall: 81,   // black ball, sealed
  crank: 105,      // the crank turns
  ticketOut: 143,  // ticket 271 comes out as the lot
};
