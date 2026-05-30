export const DEFAULT_SETTINGS = {
  schedule: {
    hour: 1,
    minute: 0
  },
  ui: {
    theme: "auto"
  },
  notifications: {
    discord: {
      enabled: false,
      webhookUrl: ""
    },
    telegram: {
      enabled: false,
      botToken: "",
      chatId: ""
    },
    email: {
      enabled: false,
      recipients: "",
      smtp: {
        host: "",
        port: 587,
        user: "",
        pass: "",
        secure: false,
        from: "UpdateBoard <noreply@example.com>"
      }
    },
    webhook: {
      enabled: false,
      url: "",
      method: "POST"
    }
  }
};

export const DEFAULT_STATE = {
  lastRunAt: null,
  nextRunAt: null,
  itemsNeedingUpdate: 0,
  containers: [],
  lastErrors: []
};
