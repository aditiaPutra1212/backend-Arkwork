"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// GET /api/dashboard
router.get("/", (_req, res) => {
    res.json({
        widgets: [
            { id: 1, name: "Users", value: 120 },
            { id: 2, name: "Revenue", value: 540000 }
        ]
    });
});
exports.default = router;
