jest.mock('../src/whatsapp/client', () => ({
  getClient: jest.fn(),
  isReady: jest.fn(),
}));

const { getStatus } = require('../src/controllers/status.controller');
const { getClient, isReady } = require('../src/whatsapp/client');

function createResponse() {
  return {
    json: jest.fn(),
  };
}

describe('Status controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns selected account status when account is not ready', () => {
    isReady.mockReturnValue(false);
    const req = { accountId: 'billing-main' };
    const res = createResponse();
    const next = jest.fn();

    getStatus(req, res, next);

    expect(isReady).toHaveBeenCalledWith('billing-main');
    expect(getClient).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      account_id: 'billing-main',
      whatsapp_ready: false,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns selected account identity when account is ready', () => {
    isReady.mockReturnValue(true);
    getClient.mockReturnValue({
      info: {
        pushname: 'Billing Bot',
        wid: { _serialized: '628111111111@c.us' },
      },
    });
    const req = { accountId: 'billing-main' };
    const res = createResponse();
    const next = jest.fn();

    getStatus(req, res, next);

    expect(isReady).toHaveBeenCalledWith('billing-main');
    expect(getClient).toHaveBeenCalledWith('billing-main');
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      account_id: 'billing-main',
      whatsapp_ready: true,
      user: 'Billing Bot',
      phone: '628111111111@c.us',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
