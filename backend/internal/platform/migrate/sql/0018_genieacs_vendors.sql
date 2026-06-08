CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    manufacturer_patterns TEXT NOT NULL, -- JSON array of patterns
    product_patterns TEXT NOT NULL, -- JSON array of patterns
    parameter_prefix TEXT,
    service_list_path TEXT,
    lan_binding_path TEXT,
    vlan_id_path TEXT,
    http_wan_enable_path TEXT,
    firewall_level_path TEXT,
    priority INTEGER DEFAULT 10,
    enabled INTEGER DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wifi_security_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_class TEXT NOT NULL UNIQUE,
    security_types TEXT NOT NULL, -- Comma separated values
    password_param_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed vendors
INSERT OR IGNORE INTO vendors (id, name, manufacturer_patterns, product_patterns, parameter_prefix, service_list_path, lan_binding_path, vlan_id_path, http_wan_enable_path, firewall_level_path, priority, enabled, description) VALUES
(12, 'FiberHome', '["fh"]', '["an5506","hg6145","HG624","HG654"]', 'X_FH', 'X_FH_ServiceList', 'X_FH_LanInterface', 'VLANID', 'InternetGatewayDevice.X_FH_FireWall.REMOTEACCEnable', 'InternetGatewayDevice.X_FH_FireWall.LEVEL', 10, 1, 'FiberHome Telecommunication Technologies ONT devices'),
(13, 'Huawei', '["huawei"]', '["eg8","hg8","hs8","HG8245H5"]', 'X_HW', 'X_HW_SERVICELIST', 'X_HW_LANBIND', 'X_HW_VLAN', 'InternetGatewayDevice.X_HW_Security.AclServices.HTTPWanEnable', 'InternetGatewayDevice.X_HW_Security.X_HW_FirewallLevel', 10, 1, 'Huawei Technologies ONT devices'),
(14, 'ZTE CT-COM', '["zicg","ciot","ggcl","hwtc"]', '["f663nv3a","GM219","G665 XPON","ZL-2113X","GM220","F450","G663","XSF609"]', 'X_CT-COM', 'X_CT-COM_ServiceList', 'X_CT-COM_LanInterface', 'X_CT-COM_WANEponLinkConfig.VLANIDMark', '', '', 8, 1, 'ZTE China Telecom variant'),
(15, 'ZTE X_CU', '["ZXHN"]', '["F477"]', 'X_CU', 'X_CU_ServiceList', 'X_CU_LanInterface', 'X_CU_VLAN', NULL, NULL, 10, 1, NULL),
(16, 'ZTE X_ZTE-COM', '["ZTE"]', '["F670L","F609","F672Y","F679L","F660"]', 'X_ZTE-COM', 'X_ZTE-COM_ServiceList', 'X_ZTE-COM_LanInterface', 'X_ZTE-COM_VLANID', '', '', 10, 1, ''),
(17, 'ZTE CMCC', '["zte"]', '["f663nv9","F663NV3A"]', 'X_CMCC', 'X_CMCC_ServiceList', 'X_CMCC_LanInterface', 'X_CMCC_VLANIDMark', '', '', 9, 1, 'ZTE China Mobile variant'),
(18, 'NOKIA ', '["ALCL"]', '["G-"]', 'X_ALU-COM', 'X_D0542D_ServiceList', 'X_ALU-COM_LanInterface', 'X_CT-COM_WANGponLinkConfig.VLANIDMark', '', '', 10, 1, '');

-- Seed wifi_security_config
INSERT OR IGNORE INTO wifi_security_config (id, product_class, security_types, password_param_path) VALUES
(10, 'F477V2 EPON,ZXHN F477,ZXHN F477V2', 'WPAand11i,None', 'PreSharedKey.1.KeyPassphrase'),
(11, 'F663NV3A,F663NV9,ZX-F663NV3a XPON,GM220-S,F609,ZXHN F450(EPON ONU),G663-XPON,G665 XPON,XSF609', 'WPA/WPA2,None', 'KeyPassphrase'),
(12, 'HG6145D2,HG6145F,HG6243C,HG6543D', '11i,WPA/WPA2,None', 'PreSharedKey.1.KeyPassphrase'),
(13, 'HS8145C5,EG8145V5,HG8245H,EG8141A5,HG8245A,HG8145V5', 'WPAand11i,Basic', 'PreSharedKey.1.KeyPassphrase'),
(14, 'ZL-2113X', 'WPAand11i,None', 'KeyPassphrase'),
(15, 'F670,F670L,F672Y,F679L,F660', '11i,WPAand11i,None', 'PreSharedKey.1.KeyPassphrase'),
(16, 'G-1425G-B,G-1425G-H', 'WPAand11i,11i,Basic', 'PreSharedKey.1.KeyPassphrase');
