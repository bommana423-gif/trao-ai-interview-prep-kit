import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    name: {
      type: String,
      trim: true,
      default: 'Candidate'
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false // Never leak passwordHash in queries by default
    }
  },
  {
    timestamps: true
  }
);

// Helper method to hash passwords consistently
userSchema.statics.hashPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plainPassword, salt);
};

// Instance method to verify password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Instance method to return safe public representation (no sensitive fields)
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    createdAt: this.createdAt
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
