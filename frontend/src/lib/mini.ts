/**
 * ריבועוני's boards go by "mini-<date>" wherever the big board's go by their
 * date (the API's routes, progress keys). The one place that knows the prefix,
 * like MINI in backend/app/boards.py.
 */
const PREFIX = "mini-";

export const isMini = (id: string) => id.startsWith(PREFIX);

/** The calendar date of a board id, either game's. */
export const boardDate = (id: string) => (isMini(id) ? id.slice(PREFIX.length) : id);
