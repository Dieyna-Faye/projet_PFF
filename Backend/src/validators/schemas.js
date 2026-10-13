const { Joi } = require('../middleware/validate');

const registerSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'authority', 'supplier', 'commission', 'auditor'),
  phone: Joi.string().allow(''),
  address: Joi.string().allow(''),
  companyName: Joi.string().allow(''),
  activitySector: Joi.string().allow(''),
  yearsExperience: Joi.number().integer().min(0).default(0),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const userCreateSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'authority', 'supplier', 'commission', 'auditor'),
  phone: Joi.string().allow(''),
  address: Joi.string().allow(''),
  companyName: Joi.string().allow(''),
});

const userUpdateSchema = Joi.object({
  firstName: Joi.string(),
  lastName: Joi.string(),
  phone: Joi.string().allow(''),
  address: Joi.string().allow(''),
  isActive: Joi.boolean(),
  password: Joi.string().min(6),
});

const userRoleSchema = Joi.object({ role: Joi.string().valid('admin', 'authority', 'supplier', 'commission', 'auditor').required() });

const roleSchema = Joi.object({
  name: Joi.string().required(),
  label: Joi.string().required(),
  permissions: Joi.array().items(Joi.string()).default([]),
});

const tenderSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().allow(''),
  type: Joi.string().required(),
  estimatedBudget: Joi.number().min(0).required(),
  currency: Joi.string(),
  submissionDeadline: Joi.date().required(),
});

const bidSchema = Joi.object({
  technicalProposal: Joi.string().allow(''),
  financialAmount: Joi.number().min(0).required(),
  currency: Joi.string(),
  executionDelayDays: Joi.number().integer().min(0),
});

const criteriaSchema = Joi.object({
  label: Joi.string().required(),
  description: Joi.string().allow(''),
  weight: Joi.number().min(0).default(0),
  maxScore: Joi.number().greater(0).default(20),
  category: Joi.string().default('technique'),
});

const evaluationSchema = Joi.object({
  bidId: Joi.string().required(),
  criteriaId: Joi.string().required(),
  score: Joi.number().min(0).required(),
  comment: Joi.string().allow(''),
});

const documentReviewSchema = Joi.object({
  status: Joi.string().valid('conforme', 'non_conforme', 'a_verifier').required(),
  comment: Joi.string().trim().min(10).max(2000).required(),
});

const rolePermissionsSchema = Joi.object({
  permissions: Joi.array().items(Joi.string().max(80)).max(50).required(),
});

const committeeDecisionSchema = Joi.object({
  decision: Joi.string().valid('validee', 'rejetee').required(),
  comment: Joi.string().trim().min(10).max(2000).required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  userCreateSchema,
  userUpdateSchema,
  userRoleSchema,
  roleSchema,
  tenderSchema,
  bidSchema,
  criteriaSchema,
  evaluationSchema,
  documentReviewSchema,
  rolePermissionsSchema,
  committeeDecisionSchema,
};
