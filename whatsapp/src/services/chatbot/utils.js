const normalizePhone = (rawFrom) => rawFrom.replace(/@(c\.us|lid)$/, '').replace(/^0/, '62');

const greeting = () => {
    const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
    if (hour < 11) return 'pagi';
    if (hour < 15) return 'siang';
    if (hour < 19) return 'sore';
    return 'malam';
};

const formatRp = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

const formatDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const renderTemplate = (templateStr, variables) => {
    let result = templateStr || '';
    for (const key in variables) {
        result = result.split(`{${key}}`).join(variables[key] !== undefined ? variables[key] : '');
    }
    return result;
};

const matchTrigger = (inputStr, triggerStr) => {
    if (!triggerStr) return false;
    return triggerStr.split(',').map(x => x.trim().toLowerCase()).includes(inputStr.trim().toLowerCase());
};

module.exports = {
    normalizePhone,
    greeting,
    formatRp,
    formatDate,
    renderTemplate,
    matchTrigger
};
