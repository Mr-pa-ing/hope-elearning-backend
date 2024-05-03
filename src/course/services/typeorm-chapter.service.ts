import { DomainError } from '@/common/errors';
import { normalizeSlug } from '@/common/utils';
import { ChapterEntity } from '@/core/entities/chapter.entity';
import { CompletedLessonEntity } from '@/core/entities/completed-lesson.entity';
import { CourseEntity } from '@/core/entities/course.entity';
import { LessonRevisionEntity } from '@/core/entities/lesson-revision.entity';
import { LessonEntity } from '@/core/entities/lesson.entity';
import {
  ChapterCreateDto,
  ChapterDto,
  ChapterUpdateDto,
  SortUpdateDto,
} from '@/core/models';
import { ChapterService } from '@/core/services';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';

@Injectable()
export class TypeormChapterService implements ChapterService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(CourseEntity)
    private courseRepo: Repository<CourseEntity>,
    @InjectRepository(ChapterEntity)
    private chapterRepo: Repository<ChapterEntity>,
  ) {}

  async create(values: ChapterCreateDto): Promise<string> {
    if (!(await this.courseRepo.existsBy({ id: values.courseId }))) {
      throw new DomainError('Course not found');
    }

    const result = await this.chapterRepo.insert({
      title: values.title,
      sortOrder: values.sortOrder,
      course: { id: values.courseId },
      slug: await normalizeSlug(
        values.title,
        (v) => {
          return this.chapterRepo.existsBy({ slug: v });
        },
        false,
      ),
    });

    return result.identifiers[0].id;
  }

  async update(values: ChapterUpdateDto): Promise<void> {
    const entity = await this.chapterRepo.findOneBy({ id: values.id });

    if (!entity) {
      throw new DomainError('Chapter not found');
    }

    const dbUpdatedAt = new Date(entity.updatedAt).getTime();
    const userUpdatedAt = new Date(values.updatedAt).getTime();

    if (dbUpdatedAt > userUpdatedAt) {
      throw new DomainError('Update conflict by another user. Please refresh.');
    }

    await this.chapterRepo.update(values.id, {
      title: values.title,
      slug:
        entity.slug !== values.slug
          ? await normalizeSlug(
              values.slug,
              (v) => {
                return this.chapterRepo.existsBy({ slug: v });
              },
              false,
            )
          : undefined,
    });
  }

  async updateSort(values: [SortUpdateDto]): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      for (const v of values) {
        await em.update(ChapterEntity, v.id, {
          sortOrder: v.sortOrder,
        });
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.delete(CompletedLessonEntity, { chapterId: id });
      await em.delete(LessonRevisionEntity, { chapterId: id });
      await em.delete(LessonEntity, { chapterId: id });
      await em.delete(ChapterEntity, id);
    });
  }

  async findById(id: string): Promise<ChapterDto | undefined> {
    const entity = await this.chapterRepo.findOneBy({ id: id });
    return entity?.toDto();
  }
}
