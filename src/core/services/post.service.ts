import {
  PageDto,
  PostCreateDto,
  PostDto,
  PostQueryDto,
  PostStatus,
  PostUpdateDto,
} from '../models';

export interface PostService {
  create(values: PostCreateDto): Promise<number>;

  update(values: PostUpdateDto): Promise<PostDto>;

  updateStatus(id: string, status: PostStatus): Promise<void>;

  delete(id: string): Promise<void>;

  existsByIdAndAuthor(id: string, authorId: string): Promise<boolean>;

  findById(id: string): Promise<PostDto | null>;

  findBySlug(slug: string): Promise<PostDto | null>;

  find(query: PostQueryDto): Promise<PageDto<PostDto>>;
}

export const POST_SERVICE = 'PostService';
