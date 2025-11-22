"use client";

type LogoutHandler = (() => void) | null;

let logoutHandler: LogoutHandler = null;

export const registerLogoutHandler = (handler: LogoutHandler) => {
  logoutHandler = handler;
};

export const notifyInvalidToken = () => {
  if (typeof window === "undefined") return;
  if (logoutHandler) {
    logoutHandler();
  }
};
