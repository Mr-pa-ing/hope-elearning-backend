import { DomainError } from '@/common/errors/domain.error';
import { normalizeSlug, transformToArray } from '@/common/utils';
import { PostAuthorEntity } from '@/core/entities/post-author.entity';
import { PostHistoryEntity } from '@/core/entities/post-history.entity';
import { PostStatisticEntity } from '@/core/entities/post-statistic.entity';
import { PostTagEntity } from '@/core/entities/post-tag.entity';
import { PostEntity } from '@/core/entities/post.entity';
import {
  PageDto,
  PostCreateDto,
  PostDto,
  PostQueryDto,
  PostStatus,
  PostUpdateDto,
  QueryDto,
} from '@/core/models';
import { PostService } from '@/core/services';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';

@Injectable()
export class TypeormPostService implements PostService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(PostEntity)
    private postRepo: Repository<PostEntity>,
    @InjectRepository(PostStatisticEntity)
    private postStatisticRepo: Repository<PostStatisticEntity>,
    @InjectRepository(PostAuthorEntity)
    private postAuthorRepo: Repository<PostAuthorEntity>,
  ) {}

  async create(values: PostCreateDto): Promise<number> {
    return await this.dataSource.transaction(async (em) => {
      if (values.authors.length === 0) {
        throw new DomainError('Required at least one author');
      }

      const result = await em.insert(PostEntity, {
        cover: values.cover,
        title: values.title,
        excerpt: values.excerpt,
        lexical: values.lexical,
        slug: await normalizeSlug(values.slug, (v) => {
          return em.existsBy(PostEntity, { slug: v });
        }),
      });

      const postId = result.identifiers[0].id;

      const postAuthors = values.authors.map((id, i) => {
        return {
          authorId: id,
          postId: postId,
          sortOrder: i,
        } as PostAuthorEntity;
      });

      await em.insert(PostAuthorEntity, postAuthors);

      if (values.tags && values.tags.length > 0) {
        const postTags = values.tags.map((id, i) => {
          return {
            postId: postId,
            tagId: id,
            sortOrder: i,
          } as PostTagEntity;
        });
        await em.insert(PostTagEntity, postTags);
      }

      await em.insert(PostStatisticEntity, {
        id: postId,
      });

      return postId;
    });
  }

  async update(values: PostUpdateDto): Promise<PostDto> {
    const entity = await this.dataSource.transaction(async (em) => {
      const postId = values.id;

      const entity = await em.findOneBy(PostEntity, {
        id: postId,
      });

      if (!entity) {
        throw new DomainError('Post not found');
      }

      const dbUpdatedAt = new Date(entity.updatedAt).getTime();
      const userUpdatedAt = new Date(values.updatedAt).getTime();

      if (dbUpdatedAt > userUpdatedAt) {
        throw new DomainError(
          'Update conflict by another user. Please refresh.',
        );
      }

      await em.update(PostEntity, postId, {
        title: values.title,
        cover: values.cover ?? null,
        excerpt: values.excerpt ?? null,
        lexical: values.lexical ?? null,
        visibility: values.visibility,
        slug:
          entity.slug !== values.slug
            ? await normalizeSlug(values.slug, (v) => {
                return em.existsBy(PostEntity, { id: Not(postId), slug: v });
              })
            : undefined,
      });

      if (values.authors) {
        const postAuthors = values.authors.map((id, i) => {
          return {
            authorId: id,
            postId: postId,
            sortOrder: i,
          } as PostAuthorEntity;
        });

        await em.delete(PostAuthorEntity, { postId: postId });
        await em.insert(PostAuthorEntity, postAuthors);
      }

      if (values.tags) {
        const postTags = values.tags.map((id, i) => {
          return {
            postId: postId,
            tagId: id,
            sortOrder: i,
          } as PostTagEntity;
        });
        await em.delete(PostTagEntity, { postId: postId });
        await em.insert(PostTagEntity, postTags);
      }

      return em.findOneOrFail(PostEntity, {
        relations: {
          tags: { tag: true },
          authors: { author: true },
        },
        where: {
          id: postId,
        },
      });
    });

    return entity.toDto();
  }

  async updateStatus(id: string, status: PostStatus): Promise<void> {
    const exists = await this.postRepo.existsBy({ id: id });
    if (!exists) {
      throw new DomainError('Post not found');
    }

    await this.postRepo.update(id, { status: status });
  }

  async delete(id: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.delete(PostTagEntity, { postId: id });
      await em.delete(PostHistoryEntity, { postId: id });
      await em.delete(PostAuthorEntity, { postId: id });
      await em.delete(PostStatisticEntity, id);
      await em.delete(PostEntity, id);
    });
  }

  async existsByIdAndAuthor(id: string, authorId: string): Promise<boolean> {
    return await this.postAuthorRepo.existsBy({
      postId: id,
      authorId: authorId,
    });
  }

  async findById(id: string): Promise<PostDto | null> {
    const entity = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'post_author')
      .leftJoinAndSelect('post.tags', 'post_tag')
      .leftJoinAndSelect('post_author.author', 'author')
      .leftJoinAndSelect('post_tag.tag', 'tag')
      .where('post.id = :id', { id })
      .getOne();

    return entity?.toDto() ?? null;
  }

  async findBySlug(slug: string): Promise<PostDto | null> {
    const entity = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.statistic', 'statistic')
      .leftJoinAndSelect('post.authors', 'post_author')
      .leftJoinAndSelect('post.tags', 'post_tag')
      .leftJoinAndSelect('post_author.author', 'author')
      .leftJoinAndSelect('post_tag.tag', 'tag')
      .where('post.slug = :slug', { slug })
      .getOne();

    if (entity) {
      this.postStatisticRepo.increment({ id: entity.id }, 'totalView', 1);
    }
    return entity?.toDto() ?? null;
  }

  async find(query: PostQueryDto): Promise<PageDto<PostDto>> {
    const { limit, offset } = QueryDto.getPageable(query);

    const tags = transformToArray(query.tag);

    const postQuery = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'post_author')
      .leftJoinAndSelect('post.tags', 'post_tag')
      .leftJoinAndSelect('post_author.author', 'author')
      .leftJoinAndSelect('post_tag.tag', 'tag');

    if (query.status) {
      postQuery.andWhere('post.status = :status', { status: query.status });
    }

    if (query.visibility) {
      postQuery.andWhere('post.visibility = :visibility', {
        visibility: query.visibility,
      });
    }

    if (query.featured) {
      postQuery.andWhere('post.featured = :featured', {
        visibility: query.featured,
      });
    }

    if (query.q) {
      postQuery.andWhere('LOWER(post.title) LIKE LOWER(:title)', {
        title: `%${query.q}%`,
      });
    }

    if (query.author) {
      postQuery.andWhere('post_author.authorId = :authorId', {
        authorId: query.author,
      });
    }

    if (tags) {
      postQuery.andWhere('post_tag.tagId IN(:...tags)', {
        tags: tags.filter((v) => !isNaN(v)),
      });
    }

    const [list, count] = await postQuery
      .orderBy('post.createdAt', 'DESC')
      .offset(offset)
      .limit(limit)
      .getManyAndCount();

    return PageDto.from({
      list: list.map((e) => e.toDto()),
      count: count,
      offset: offset,
      limit: limit,
    });
  }
}
