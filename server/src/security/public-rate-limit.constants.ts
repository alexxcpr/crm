import {
  hours,
  minutes,
} from '@nestjs/throttler';

export const PUBLIC_RATE_LIMITS = {
  auth: {
    signin: {
      burst: { limit: 10, ttl: minutes(1) },
      sustained: { limit: 30, ttl: minutes(15) },
    },
    signup: {
      burst: { limit: 2, ttl: minutes(1) },
      sustained: { limit: 3, ttl: hours(1) },
    },
    refresh: {
      burst: { limit: 30, ttl: minutes(1) },
      sustained: { limit: 150, ttl: minutes(15) },
    },
    signout: {
      burst: { limit: 30, ttl: minutes(1) },
      sustained: { limit: 150, ttl: minutes(15) },
    },
  },
  health: {
    burst: { limit: 30, ttl: minutes(1) },
    sustained: { limit: 120, ttl: minutes(15) },
  },
  provisioning: {
    write: {
      burst: { limit: 20, ttl: minutes(1) },
      sustained: { limit: 100, ttl: minutes(15) },
    },
    read: {
      burst: { limit: 120, ttl: minutes(1) },
      sustained: {
        limit: 1_800,
        ttl: minutes(15),
      },
    },
  },
};
