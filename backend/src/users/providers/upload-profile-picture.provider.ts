import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { ProfilePictureUrls } from '../../cloudinary/cloudinary.service';

@Injectable()
export class UploadProfilePictureProvider {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  /**
   * Persist multi-resolution profile picture URLs on the user record.
   *
   * Also writes the avatar URL to the legacy `profilePicture` column so that
   * any existing code that reads `profilePicture` continues to work without
   * modification (backward-compatible fallback).
   */
  async execute(id: string, urls: ProfilePictureUrls): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.profilePictureUrls = urls;
    // Backward-compat: expose the avatar variant via the old single-URL field
    user.profilePicture = urls.avatar;

    return this.repo.save(user);
  }
}
