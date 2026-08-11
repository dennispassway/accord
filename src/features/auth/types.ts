export type AuthState =
  | { status: "checking" }
  | { status: "unconfigured" }
  | { status: "loggedOut" }
  | { status: "deviceCodePending"; userCode: string; verificationUri: string }
  | { status: "loggedIn"; login: string }
  | { status: "error"; message: string };

export type DeviceLoginStart = {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
};

export type PollResult =
  | { status: "success"; token: string }
  | { status: "pending" }
  | { status: "slowDown"; interval: number }
  | { status: "expired" }
  | { status: "denied" };
